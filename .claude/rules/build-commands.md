---
paths:
  - "package.json"
  - "functions/**"
  - "__tests__/**"
  - ".github/**"
---

# Build and Development Commands

```bash
# Install dependencies
npm install

# Run local development server
npm start                    # Start on port 3000
npm run start:ngrok          # Start with ngrok tunnel

# Testing
npm test                     # Run unit and integration tests
npm run test:watch           # Run tests in watch mode
npm run test:coverage        # Run tests with coverage report
npm run test:e2e             # Run Newman E2E tests
npm run test:all             # Run all tests

# Linting
npm run lint                 # Check for linting errors
npm run lint:fix             # Auto-fix linting errors

# Deployment
npm run deploy:dev           # Deploy to dev environment
npm run deploy:prod          # Deploy to production

# Regression testing
./scripts/run-regression.sh --quick    # Fast checks only (~5 min, no LLM)
./scripts/run-regression.sh --standard # + chaos validation (~60 min)
./scripts/run-regression.sh --full     # 3 parallel headless lanes (~2 hours)
./scripts/run-regression.sh --serial   # Same as --full but sequential (~3-4 hours)
```
