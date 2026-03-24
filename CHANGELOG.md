# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- HttpOnly Cookie authentication (#12)
- Cursor-based pagination for posts (#19)
- User cache to reduce database queries (#18)
- Self-hosted fonts (@fontsource) replacing Google Fonts CDN (#14)
- Skip to content link for accessibility (#53)
- Lazy loading for images (#62)
- JSDoc documentation for service functions (#42)
- Comprehensive README documentation (#72)

### Changed
- Dynamic Swagger URL from environment variable (#39)
- Improved environment variable handling with development defaults (#38)
- Code splitting for better bundle size (#66)

### Security
- Token stored in HttpOnly Cookie (XSS protection)
- File upload validation improvements

## [1.0.0] - 2026-03-05

### Added
- Initial release
- JWT authentication system
- Blog post CRUD operations
- Media upload functionality
- Swagger API documentation
- CSP security headers
- Token blacklist for logout
- Error boundary component
- XSS protection with DOMPurify
- Password strength validation
- Admin auto-promotion for first user
- Database indexing for performance
- In-memory caching for published posts

[Unreleased]: https://github.com/chenyibo111/BlogBackend/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/chenyibo111/BlogBackend/releases/tag/v1.0.0