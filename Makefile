# Triviall. Everything here works with Node 20+, Python 3, and make. No installs.
PORT ?= 8080

.DEFAULT_GOAL := help
.PHONY: help test check serve spike clean

help: ## List the available commands
	@grep -hE '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  make %-8s %s\n", $$1, $$2}'

test: ## Run the engine, game, and UI kit tests
	node --test "tests/*.test.js"

check: test ## Tests plus a check of site links, imports, and doc anchors
	node scripts/check-links.mjs

serve: ## Serve the site locally (PORT=8080)
	@echo "Landing  http://localhost:$(PORT)/"
	@echo "Lab      http://localhost:$(PORT)/lab/"
	@echo "Docs     http://localhost:$(PORT)/docs/"
	python3 -m http.server $(PORT)

spike: ## Run automated spike checks and write docs/spike-results.md
	node scripts/spike.mjs

clean: ## Remove local junk
	rm -rf node_modules *.log
