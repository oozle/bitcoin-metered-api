# 🚀 Bitcoin Metered API - Setup Guide

This document provides an overview of the comprehensive CI/CD pipeline and security configurations added to this project.

## 📋 What's Been Added

### GitHub Actions Workflows

#### 1. **CI/CD Pipeline** (`.github/workflows/ci.yml`)
- **Multi-Node Testing**: Tests across Node.js 18, 20, and 22
- **Security Scanning**: CodeQL, Snyk, npm audit
- **Build & Package**: Automated builds with artifact uploads
- **Docker Images**: Multi-platform builds (AMD64, ARM64) with vulnerability scanning

#### 2. **Release & Publish** (`.github/workflows/release.yml`)
- **Automated Releases**: Triggered by version tags or manual dispatch
- **NPM Publishing**: Automatic package publishing to npmjs.org
- **Docker Publishing**: Images to GitHub Container Registry and Docker Hub
- **GitHub Releases**: Automated release notes with changelogs

#### 3. **Dependency Updates** (`.github/workflows/dependency-updates.yml`)
- **Scheduled Updates**: Weekly dependency updates
- **Security Auditing**: Automated vulnerability scanning and PR creation
- **Outdated Package Reports**: Regular package status reports

#### 4. **Code Quality** (`.github/workflows/code-quality.yml`)
- **Coverage Reporting**: Test coverage with Codecov integration
- **Performance Analysis**: Bundle size monitoring and large file detection
- **Technical Debt Tracking**: TODO/FIXME monitoring and complexity analysis

### Security Configurations

#### 1. **Dependabot** (`.github/dependabot.yml`)
- **Automated Updates**: NPM, Docker, and GitHub Actions dependencies
- **Grouped Updates**: Related packages updated together
- **Smart Scheduling**: Spread across weekdays to avoid conflicts

#### 2. **Security Policy** (`SECURITY.md`)
- **Vulnerability Reporting**: Clear process for security researchers
- **Response Timeline**: 48-hour initial response commitment
- **Security Best Practices**: Guidelines for secure deployment

### Docker Support

#### 1. **Production Dockerfile**
- **Multi-stage Build**: Optimized for production deployment
- **Security Hardening**: Non-root user, minimal attack surface
- **Health Checks**: Built-in container health monitoring

#### 2. **Development Environment** (`docker-compose.yml`)
- **Redis Integration**: For job queuing and caching
- **Volume Mounts**: Persistent data and logs
- **Development Tools**: Redis Commander for debugging

### Development Tools

#### 1. **Pull Request Template**
- **Comprehensive Checklist**: Security, testing, documentation
- **Bitcoin-specific Checks**: Payment processing validation
- **Consistent Reviews**: Standardized PR review process

#### 2. **Package Configuration**
- **Publishing Setup**: NPM registry configuration
- **Release Scripts**: Automated versioning and publishing
- **Docker Commands**: Easy container management

## 🔧 Required Setup

### 1. GitHub Repository Secrets

Add these secrets to your GitHub repository:

```bash
# NPM Publishing
NPM_TOKEN=your_npm_token_here

# Docker Hub (optional)
DOCKERHUB_USERNAME=your_dockerhub_username
DOCKERHUB_TOKEN=your_dockerhub_token

# Snyk Security Scanning (optional)
SNYK_TOKEN=your_snyk_token_here
```

### 2. NPM Registry Setup

1. Create an NPM account at [npmjs.com](https://npmjs.com)
2. Generate an access token with publishing rights
3. Add the token to GitHub secrets as `NPM_TOKEN`

### 3. GitHub Environments

Create a `npm-production` environment in your repository settings for controlled releases.

## 🚢 How to Create a Release

### Automatic Release (Recommended)
```bash
# Create and push a version tag
git tag -a v1.0.2 -m "Release v1.0.2"
git push origin v1.0.2
```

### Manual Release
```bash
# Use GitHub's manual workflow dispatch
# Go to Actions → Release & Publish → Run workflow
# Enter version number (e.g., 1.0.2)
```

### Quick Release Scripts
```bash
# Patch release (1.0.0 → 1.0.1)
npm run release:patch

# Minor release (1.0.0 → 1.1.0)
npm run release:minor

# Major release (1.0.0 → 2.0.0)
npm run release:major
```

## 🐳 Docker Usage

### Development
```bash
# Start full development environment
docker-compose --profile dev up -d

# Build and run just the API
docker-compose up bitcoin-api
```

### Production
```bash
# Pull from GitHub Container Registry
docker pull ghcr.io/oozle/bitcoin-metered-api:latest

# Run with environment variables
docker run -p 3000:3000 \
  -e PAYMENTS_MODE=mainnet \
  -e ARK_ASP_URL=your_asp_url \
  ghcr.io/oozle/bitcoin-metered-api:latest
```

## 🔍 Monitoring & Maintenance

### Workflow Monitoring
- **GitHub Actions**: Monitor workflow runs in the Actions tab
- **Code Coverage**: Check Codecov reports on PRs
- **Security Alerts**: GitHub Security tab for vulnerability reports

### Automated Reports
- **Weekly Dependency Reports**: Automated PRs with update summaries
- **Security Audits**: Continuous monitoring with alert notifications
- **Code Quality**: Regular complexity and technical debt reports

### Manual Checks
```bash
# Local quality checks before pushing
npm run typecheck
npm run lint
npm test
npm run build

# Docker build test
docker build -t test-build .
```

## 📚 Workflows Explained

### On Every Push/PR
1. **Code Quality**: Linting, type checking, tests
2. **Security Scan**: Dependency audit, static analysis
3. **Build Test**: Ensure clean compilation

### On Main Branch Push
1. **Full Test Suite**: All test categories
2. **Docker Build**: Multi-platform image creation
3. **Artifact Storage**: Build outputs saved

### On Version Tag
1. **Release Validation**: Version format, tag uniqueness
2. **Full Testing**: Complete test suite
3. **Package Publishing**: NPM and Docker registry updates
4. **GitHub Release**: Automated release notes

### Weekly Automation
1. **Dependency Updates**: Check for package updates
2. **Security Audit**: Vulnerability scanning
3. **Code Quality Report**: Technical debt assessment

## 🔒 Security Features

- **Supply Chain Security**: Dependabot and automated scanning
- **Container Security**: Regular image vulnerability scans
- **Code Analysis**: Static analysis with CodeQL
- **Dependency Auditing**: npm audit and Snyk integration
- **Secure Defaults**: Non-root containers, minimal surfaces

## 🎯 Next Steps

1. **Configure Repository Secrets** for publishing
2. **Enable GitHub Security Features** (Dependabot, Security advisories)
3. **Set up Monitoring** for production deployments
4. **Customize Workflows** for your specific needs
5. **Test Release Process** with a patch version

---

**Happy building! 🚀** Your Bitcoin Metered API now has enterprise-grade CI/CD and security!