# Changelog

All notable changes to Agent BREW are documented here.

## [Unreleased]

### Added

- Added Room Chat with public community rooms for token signals, market discussion, alerts, and developer updates.
- Added user profile identity in Room Chat, including username, email, and profile avatar support.
- Added Privy login support for email, wallet, and Google authentication.
- Added username and password account creation without requiring Privy, email delivery, or a wallet.
- Added thesis creation for tokens from the Token Radar and favorite-token thesis desk.
- Added recent thesis display with author username, profile avatar, creation date, and thesis content.
- Added thesis likes with one-like-per-user protection and self-like prevention.
- Added Supabase persistence for profiles, usernames, avatars, Room Chat messages, token theses, thesis likes, and favorite tokens.

### Improved

- Profile changes now synchronize across the header, Room Chat, and thesis views.
- Username claims are normalized and protected against duplicate usernames and email addresses used as usernames.
- Profile avatars remain available for existing chat messages and thesis authors after refresh.
- Room Chat and thesis authors are linked to the authenticated user ID for consistent identity tracking.
- Added internal profile synchronization through the `save_profile_identity` Supabase function.

### Fixed

- Fixed usernames reverting to the previous authentication name after being edited.
- Fixed profile avatars disappearing after page refresh.
- Fixed Room Chat overwriting a newly saved username with stale authentication data.
- Fixed thesis authors appearing as email addresses instead of usernames.
- Fixed legacy `display_name` data migration into the canonical `username` field.
- Fixed local login pages automatically opening the Privy modal when using username/password accounts.

### Database

- Consolidated profile, username claim, Room Chat, thesis, likes, favorites, visitor, and token data into the Supabase schema.
- Added migration support for existing profile, chat, thesis, cache, and visitor records.
- Added `claimed_usernames` constraints to enforce normalized, unique, non-email usernames.
