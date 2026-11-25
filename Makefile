.PHONY: up down gen lint test test-backend test-web build

up:
	@if [ -f deploy/compose/compose.yaml ]; then \
		docker compose -f deploy/compose/compose.yaml up -d --build; \
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
	node contracts/bundle.mjs
	cd backend && go tool oapi-codegen -config ../contracts/codegen/oapi-codegen.yaml ../contracts/openapi/dist/openapi.yaml
	cd backend && go tool sqlc generate
	pnpm --dir web exec openapi-typescript ../contracts/openapi/dist/openapi.yaml -o src/lib/api/generated/schema.d.ts
	pnpm --dir web run msw:init

lint:
	node contracts/bundle.mjs
	pnpm exec spectral lint contracts/openapi/dist/openapi.yaml --ruleset contracts/.spectral.yaml
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
