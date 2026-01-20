#!/usr/bin/env python3
"""Google Drive OAuth2 authentication script.

Run this script to authenticate with Google Drive. Supports both browser-based
and console-based flows (for Docker/headless environments).

Usage:
    # Browser mode (default, run locally)
    python scripts/gdrive_auth.py --client-secrets /path/to/oauth_client.json

    # Console mode (for Docker)
    python scripts/gdrive_auth.py --client-secrets /path/to/oauth_client.json --console

The script will save tokens to ./data/gdrive_tokens.json by default.
"""

import argparse
from pathlib import Path

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow

# Scopes for Google Drive read-only access
SCOPES = ["https://www.googleapis.com/auth/drive.readonly"]


def authenticate(
    client_secrets_path: Path, tokens_path: Path, console_mode: bool = False
) -> Credentials:
    """Run OAuth2 flow and return credentials."""
    creds = None

    # Check if we have existing tokens
    if tokens_path.exists():
        creds = Credentials.from_authorized_user_file(str(tokens_path), SCOPES)

    # If no valid credentials, run the auth flow
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            print("Refreshing expired tokens...")
            creds.refresh(Request())
        else:
            print(f"Starting OAuth2 flow with: {client_secrets_path}")

            flow = InstalledAppFlow.from_client_secrets_file(
                str(client_secrets_path), SCOPES
            )

            if console_mode:
                print()
                print("=" * 60)
                print("CONSOLE MODE")
                print("=" * 60)
                print()
                print("1. Copy the URL below and open it in your browser")
                print("2. Authorize access")
                print("3. You'll be redirected to a localhost URL that won't load")
                print("4. Copy the FULL URL from your browser's address bar")
                print("5. Paste it here")
                print()

                # Set redirect to localhost - user will copy the redirect URL
                flow.redirect_uri = "http://localhost:8080/"
                auth_url, _ = flow.authorization_url(
                    access_type="offline",
                    include_granted_scopes="true",
                    prompt="consent",
                )
                print(f"Visit this URL:\n\n{auth_url}\n")

                redirect_response = input("Paste the full redirect URL here: ").strip()

                # Extract the code from the URL
                from urllib.parse import parse_qs, urlparse

                parsed = urlparse(redirect_response)
                code = parse_qs(parsed.query).get("code", [None])[0]

                if not code:
                    print("Error: Could not extract authorization code from URL")
                    return None

                flow.fetch_token(code=code)
                creds = flow.credentials
            else:
                print("A browser window will open for you to authorize access.")
                print()
                creds = flow.run_local_server(port=8080)

        # Save the credentials for future use
        tokens_path.parent.mkdir(parents=True, exist_ok=True)
        with open(tokens_path, "w") as f:
            f.write(creds.to_json())
        print(f"\nTokens saved to: {tokens_path}")

    return creds


def main():
    parser = argparse.ArgumentParser(
        description="Authenticate with Google Drive using OAuth2"
    )
    parser.add_argument(
        "--client-secrets",
        "-c",
        type=Path,
        required=True,
        help="Path to OAuth2 client secrets JSON file (download from GCP Console)",
    )
    parser.add_argument(
        "--tokens",
        "-t",
        type=Path,
        default=Path("./data/gdrive_tokens.json"),
        help="Path to save/load tokens (default: ./data/gdrive_tokens.json)",
    )
    parser.add_argument(
        "--console",
        action="store_true",
        help="Use console mode (for Docker/headless). Prints URL to copy-paste.",
    )
    args = parser.parse_args()

    if not args.client_secrets.exists():
        print(f"Error: Client secrets file not found: {args.client_secrets}")
        print()
        print("To create OAuth2 credentials:")
        print("1. Go to https://console.cloud.google.com/")
        print("2. APIs & Services -> Credentials")
        print("3. Create Credentials -> OAuth client ID")
        print("4. Choose 'Desktop app' as application type")
        print("5. Download the JSON file")
        return 1

    creds = authenticate(args.client_secrets, args.tokens, args.console)

    # Test the credentials
    from googleapiclient.discovery import build

    drive = build("drive", "v3", credentials=creds)
    about = drive.about().get(fields="user").execute()
    user = about.get("user", {})

    print()
    print("=" * 50)
    print("Authentication successful!")
    print(f"Authenticated as: {user.get('displayName')} ({user.get('emailAddress')})")
    print("=" * 50)
    print()
    print("You can now use Google Drive in the transformer.")
    print(f"Tokens are stored in: {args.tokens}")

    return 0


if __name__ == "__main__":
    exit(main())
