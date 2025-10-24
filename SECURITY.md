# Security Policy

## Supported Versions

We actively maintain and provide security updates for the following versions:

| Version | Supported          | Notes                    |
| ------- | ------------------ | ------------------------ |
| 1.x.x   | ✅ Yes            | Current stable release   |
| 0.x.x   | ❌ No             | Pre-release, deprecated  |

## Reporting a Vulnerability

We take security vulnerabilities seriously. If you discover a security issue in this project, please report it responsibly.

### How to Report

**Do NOT create a public GitHub issue for security vulnerabilities.**

Instead, please use one of these methods:

1. **GitHub Security Advisories** (Recommended)
   - Go to the [Security tab](https://github.com/oozle/bitcoin-metered-api/security/advisories) of this repository
   - Click "Report a vulnerability"
   - Provide detailed information about the vulnerability

2. **Email**
   - Send an email to: security@[your-domain].com
   - Use PGP encryption if possible (key available on request)
   - Include "Security Vulnerability - Bitcoin Metered API" in the subject line

### What to Include

Please provide the following information:

- **Description**: Clear description of the vulnerability
- **Impact**: Potential impact and affected components
- **Reproduction**: Step-by-step instructions to reproduce
- **Environment**: Operating system, Node.js version, package version
- **Proof of Concept**: Code snippet, screenshots, or logs (if safe to share)
- **Suggested Fix**: If you have ideas for remediation

### Response Timeline

- **Initial Response**: Within 48 hours
- **Assessment**: Within 5 business days
- **Fix Development**: Depends on complexity (typically 1-4 weeks)
- **Disclosure**: Coordinated disclosure after fix is available

### Security Considerations

This project handles Bitcoin payments and financial transactions. Security areas of particular concern:

#### High Priority
- **Payment Processing**: VTXO handling, signature verification
- **Authentication**: API authentication, cryptographic operations
- **Data Handling**: Payment data, transaction logs, user information
- **Network Security**: API endpoints, external service communication

#### Medium Priority  
- **Input Validation**: Request parsing, parameter validation
- **Database Security**: SQLite queries, data storage
- **Logging**: Sensitive data exposure in logs
- **Configuration**: Environment variables, secrets management

#### Security Features

- **Payment Verification**: All Bitcoin transactions verified before processing
- **Idempotency**: Protection against replay attacks and double-spending
- **Rate Limiting**: Protection against abuse (implement in production)
- **Audit Logging**: Complete transaction history and payment trails
- **Environment Isolation**: Separate configs for development/production

### Secure Development

We follow these security practices:

- **Dependency Management**: Regular security audits with npm audit and Snyk
- **Static Analysis**: CodeQL for static code analysis
- **Container Security**: Regular Docker image vulnerability scans with Trivy
- **Automated Testing**: Security-focused test cases
- **Code Review**: All changes reviewed before merging

### Security Tools in Use

- **GitHub Security Advisories**: Vulnerability management
- **Dependabot**: Automated dependency updates
- **CodeQL**: Static analysis and vulnerability detection
- **Snyk**: Dependency vulnerability scanning
- **Trivy**: Container image security scanning
- **npm audit**: Node.js dependency security

### Security Best Practices for Users

When deploying this API:

1. **Environment Security**
   ```bash
   # Use proper environment variables
   export PAYMENTS_MODE=mainnet  # or testnet
   export ARK_ASP_URL=https://your-asp-url
   # Never commit secrets to version control
   ```

2. **Network Security**
   - Use HTTPS in production
   - Implement proper firewall rules
   - Consider API rate limiting
   - Use reverse proxy (nginx, Cloudflare)

3. **Bitcoin Security**
   - Verify ASP (Arkade Service Provider) authenticity
   - Monitor payment confirmations
   - Implement proper key management
   - Regular backup of wallet data

4. **Monitoring**
   - Set up alerts for failed payments
   - Monitor unusual API usage patterns
   - Track security audit results
   - Log security events

### Disclosure Policy

- We practice **coordinated disclosure**
- Security researchers will be credited (if desired)
- We aim to publish advisories within 90 days of fix availability
- Critical vulnerabilities may be disclosed sooner with workarounds

### Security Hall of Fame

We recognize security researchers who help improve our security:

<!-- Security researchers will be listed here -->

Thank you for helping keep Bitcoin Metered API secure! 🔒

---

**Note**: This project is a proof-of-concept. For production use, conduct thorough security audits and consider professional security consultation.