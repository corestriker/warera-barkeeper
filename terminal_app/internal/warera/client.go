// Package warera spricht die öffentliche tRPC-Schnittstelle von WarEra an.
//
// Alle verwendeten Endpunkte sind öffentlich und ausschließlich lesend. Es
// wird kein API-Key benötigt, es werden keine Zugangsdaten gespeichert und es
// wird nichts geschrieben — der Spielername genügt.
package warera

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// DefaultBaseURL ist die offizielle tRPC-Basis.
const DefaultBaseURL = "https://api2.warera.io/trpc"

// Cloudflare vor der API beantwortet Anfragen mit werkzeugtypischem User-Agent
// teilweise mit leerem Body. Ein browserähnlicher Agent plus passender Origin
// ist deshalb keine Kosmetik, sondern Voraussetzung für stabile Antworten.
const (
	userAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
		"AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
	originHeader = "https://app.warera.io"
)

// Die Fehler, die den Nutzer betreffen, sind Sentinels: die Oberfläche prüft
// sie mit errors.Is und formuliert die Meldung in der eingestellten Sprache.
// Alles andere ist technisch und wird unübersetzt durchgereicht — deshalb sind
// diese Texte englisch, wie in Go üblich.
var (
	ErrNoUsername = errors.New("no player name given")
	ErrNotFound   = errors.New("player not found")
	ErrAmbiguous  = errors.New("player name is ambiguous")
)

// Client ruft WarEra-Prozeduren ab.
type Client struct {
	BaseURL string
	HTTP    *http.Client
}

// New baut einen Client mit dem angegebenen Timeout.
func New(baseURL string, timeout time.Duration) *Client {
	if strings.TrimSpace(baseURL) == "" {
		baseURL = DefaultBaseURL
	}
	if timeout <= 0 {
		timeout = 8 * time.Second
	}
	return &Client{
		BaseURL: strings.TrimRight(baseURL, "/"),
		HTTP:    &http.Client{Timeout: timeout},
	}
}

// envelope ist die tRPC-Hülle um jede Antwort.
type envelope struct {
	Result struct {
		Data json.RawMessage `json:"data"`
	} `json:"result"`
	Error *struct {
		Message string `json:"message"`
		Data    struct {
			Code       string `json:"code"`
			HTTPStatus int    `json:"httpStatus"`
		} `json:"data"`
	} `json:"error"`
}

// call ruft eine Prozedur auf und schreibt result.data nach out.
//
// Die Aufrufe sind GET, nicht POST — so steht es in der offiziellen Doku
// ("every call is in GET and not POST"); die Eingabe steckt JSON-kodiert im
// Query-Parameter input.
func (c *Client) call(ctx context.Context, procedure string, input any, out any) error {
	endpoint := c.BaseURL + "/" + procedure
	if input != nil {
		raw, err := json.Marshal(input)
		if err != nil {
			return fmt.Errorf("%s: encoding input: %w", procedure, err)
		}
		endpoint += "?input=" + url.QueryEscape(string(raw))
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return fmt.Errorf("%s: building request: %w", procedure, err)
	}
	req.Header.Set("User-Agent", userAgent)
	req.Header.Set("Origin", originHeader)
	req.Header.Set("Accept", "application/json")

	resp, err := c.HTTP.Do(req)
	if err != nil {
		return fmt.Errorf("%s: %w", procedure, err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if err != nil {
		return fmt.Errorf("%s: reading response: %w", procedure, err)
	}

	var env envelope
	if err := json.Unmarshal(body, &env); err != nil {
		return fmt.Errorf("%s: response is not JSON (HTTP %d)", procedure, resp.StatusCode)
	}
	if env.Error != nil {
		return fmt.Errorf("%s: %s", procedure, env.Error.Message)
	}
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("%s: HTTP %d", procedure, resp.StatusCode)
	}
	if len(env.Result.Data) == 0 {
		return fmt.Errorf("%s: empty response", procedure)
	}
	if err := json.Unmarshal(env.Result.Data, out); err != nil {
		return fmt.Errorf("%s: decoding response: %w", procedure, err)
	}
	return nil
}

// searchResult ist die Antwort von search.searchAnything.
type searchResult struct {
	UserIDs []string `json:"userIds"`
}

// ResolveUser sucht die userId zu einem Spielernamen.
//
// Die Suche matcht unscharf und liefert bei mehrdeutigen Namen mehrere Treffer,
// deshalb wird jeder Kandidat geladen und auf exakte Namensgleichheit geprüft.
func (c *Client) ResolveUser(ctx context.Context, username string) (string, error) {
	username = strings.TrimSpace(username)
	if username == "" {
		return "", ErrNoUsername
	}

	var sr searchResult
	if err := c.call(ctx, "search.searchAnything", map[string]string{"searchText": username}, &sr); err != nil {
		return "", err
	}
	if len(sr.UserIDs) == 0 {
		return "", fmt.Errorf("%q: %w", username, ErrNotFound)
	}

	// Bei einem eindeutigen Treffer sparen wir uns die Gegenprobe.
	if len(sr.UserIDs) == 1 {
		return sr.UserIDs[0], nil
	}
	for _, id := range sr.UserIDs {
		u, err := c.GetUserLite(ctx, id)
		if err != nil {
			continue
		}
		if strings.EqualFold(u.Username, username) {
			return id, nil
		}
	}
	return "", fmt.Errorf("%q (%d matches): %w", username, len(sr.UserIDs), ErrAmbiguous)
}

// GetUserLite lädt das öffentliche Profil samt Leisten-Werten.
func (c *Client) GetUserLite(ctx context.Context, userID string) (UserLite, error) {
	var u UserLite
	err := c.call(ctx, "user.getUserLite", map[string]string{"userId": userID}, &u)
	return u, err
}

// gameDates ist der für uns relevante Teil von gameConfig.getDates.
type gameDates struct {
	NextRegenAt time.Time `json:"nextRegenAt"`
}

// NextRegenAt liefert den nächsten Regen-Tick und damit das Tick-Raster.
//
// Der Wert kommt bewusst aus der API statt als "volle Stunde UTC" fest im Code
// zu stehen: verschiebt WarEra das Raster, rechnet das Tool weiterhin richtig.
func (c *Client) NextRegenAt(ctx context.Context) (time.Time, error) {
	var d gameDates
	if err := c.call(ctx, "gameConfig.getDates", struct{}{}, &d); err != nil {
		return time.Time{}, err
	}
	if d.NextRegenAt.IsZero() {
		return time.Time{}, fmt.Errorf("gameConfig.getDates: nextRegenAt is missing")
	}
	return d.NextRegenAt, nil
}

// Fetch holt in einem Rutsch alles, was für eine Berechnung gebraucht wird.
//
// userID darf leer sein; dann wird sie aus username aufgelöst. Der Aufrufer
// bekommt die (womöglich neu ermittelte) ID zurück, um sie zu cachen.
func (c *Client) Fetch(ctx context.Context, username, userID string) (Snapshot, string, error) {
	var snap Snapshot

	if strings.TrimSpace(userID) == "" {
		id, err := c.ResolveUser(ctx, username)
		if err != nil {
			return snap, "", err
		}
		userID = id
	}

	user, err := c.GetUserLite(ctx, userID)
	if err != nil {
		return snap, userID, err
	}
	snap.User = user

	// Ein fehlender Tick-Anchor ist kein Grund, die Leisten-Werte wegzuwerfen:
	// der Aufrufer fällt dafür auf die volle Stunde UTC zurück.
	if next, err := c.NextRegenAt(ctx); err == nil {
		snap.NextRegenAt = next
	}
	snap.FetchedAt = time.Now()
	return snap, userID, nil
}
