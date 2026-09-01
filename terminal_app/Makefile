BINARY  := barkeeper
# Ohne Git-Tag (oder ganz ohne Git) bleibt VERSION leer und -X entfaellt —
# dann gilt die in main.go gepflegte Version statt eines nackten "dev".
VERSION ?= $(shell git describe --tags --always --dirty 2>/dev/null)
LDFLAGS := -s -w $(if $(strip $(VERSION)),-X main.version=$(strip $(VERSION)))
DIST    := dist

PLATFORMS := linux/amd64 linux/arm64 darwin/amd64 darwin/arm64 windows/amd64

.PHONY: all build run test vet fmt check clean build-all

all: check build

build:
	CGO_ENABLED=0 go build -ldflags "$(LDFLAGS)" -o $(BINARY) .

run: build
	./$(BINARY)

test:
	go test ./...

vet:
	go vet ./...

fmt:
	gofmt -l -w .

check: vet test
	@test -z "$$(gofmt -l .)" || { echo "nicht formatiert:"; gofmt -l .; exit 1; }

# Reines Go ohne cgo, deshalb genuegt ein GOOS/GOARCH-Durchlauf pro Ziel.
build-all: clean
	@mkdir -p $(DIST)
	@for p in $(PLATFORMS); do \
		os=$${p%/*}; arch=$${p#*/}; \
		out=$(DIST)/$(BINARY)_$${os}_$${arch}; \
		if [ "$$os" = "windows" ]; then out=$$out.exe; fi; \
		echo "  $$os/$$arch"; \
		CGO_ENABLED=0 GOOS=$$os GOARCH=$$arch \
			go build -ldflags "$(LDFLAGS)" -o $$out . || exit 1; \
	done
	@echo "fertig in $(DIST)/"

clean:
	rm -rf $(DIST) $(BINARY)
