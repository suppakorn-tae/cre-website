.PHONY: up down gen lint test test-backend test-web build

up:
	@if [ -f deploy/compose/compose.yaml ]; then \
		docker compose -f deploy/compose/compose.yaml up -d; \
	else \
		echo "deploy/compose/compose.yaml does not exist yet"; \
	fi

down:
	@if [ -f deploy/compose/compose.yaml ]; then \
		docker compose -f deploy/compose/compose.yaml down; \
	else \
		echo "deploy/compose/compose.yaml does not exist yet"; \
	fi

gen:
	@echo "no generators yet"

lint:
	@if command -v golangci-lint >/dev/null 2>&1; then \
		cd backend && golangci-lint run ./...; \
	else \
		cd backend && go vet ./...; \
	fi
	pnpm --dir web lint

test: test-backend test-web

test-backend:
	cd backend && go test ./...

test-web:
	@if node -e "process.exit(require('./web/package.json').scripts?.test ? 0 : 1)"; then \
		pnpm --dir web test; \
	else \
		echo "web: no test script, skipping"; \
	fi

build:
	cd backend && go build ./...
	pnpm --dir web build
