package warera

import "time"

// Skill ist ein Eintrag aus skills.* in user.getUserLite.
//
// Für die Berechnung zählen drei Felder: total ist der Maximalwert inklusive
// aller Boni, currentBarValue der aktuelle Füllstand (fraktional möglich) und
// hourlyBarRegen die Gutschrift pro Tick. Letzteres entspricht total/10, wird
// aber direkt übernommen statt nachgerechnet — falls WarEra die Formel ändert,
// stimmt der Wert trotzdem.
type Skill struct {
	Level          int     `json:"level"`
	Total          float64 `json:"total"`
	CurrentBar     float64 `json:"currentBarValue"`
	HourlyBarRegen float64 `json:"hourlyBarRegen"`
}

// UserLite ist der für uns relevante Ausschnitt aus user.getUserLite.
type UserLite struct {
	ID       string `json:"_id"`
	Username string `json:"username"`
	Skills   struct {
		Health Skill `json:"health"`
		Hunger Skill `json:"hunger"`
	} `json:"skills"`
	Leveling struct {
		Level int `json:"level"`
	} `json:"leveling"`
}

// Snapshot bündelt alles, was ein API-Abruf für die Berechnung liefert.
type Snapshot struct {
	User        UserLite
	NextRegenAt time.Time // Tick-Anchor aus gameConfig.getDates
	FetchedAt   time.Time
}
