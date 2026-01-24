"""Secrets encryption and management utilities.

Uses Fernet symmetric encryption to securely store connector secrets.
The encryption key is loaded from the SECRETS_KEY environment variable.
"""

import base64
import hashlib
import os
from functools import lru_cache

from cryptography.fernet import Fernet


class SecretsError(Exception):
    """Error related to secrets management."""

    pass


@lru_cache(maxsize=1)
def _get_fernet() -> Fernet:
    """Get or create the Fernet cipher for encryption.

    The key is derived from SECRETS_KEY environment variable.
    If not set, uses a deterministic key based on DATABASE_PATH for development.
    """
    key_material = os.environ.get("SECRETS_KEY")

    if not key_material:
        # Development fallback: derive key from database path
        # NOT SECURE FOR PRODUCTION - should always set SECRETS_KEY
        db_path = os.environ.get("DATABASE_PATH", "./data/workflow.db")
        key_material = f"dev-secrets-key-{db_path}"

    # Derive a valid Fernet key (32 bytes, base64-encoded)
    key_hash = hashlib.sha256(key_material.encode()).digest()
    fernet_key = base64.urlsafe_b64encode(key_hash)

    return Fernet(fernet_key)


def encrypt_secret(value: str) -> str:
    """Encrypt a secret value.

    Args:
        value: The plaintext secret value

    Returns:
        Base64-encoded encrypted value
    """
    fernet = _get_fernet()
    encrypted = fernet.encrypt(value.encode("utf-8"))
    return encrypted.decode("utf-8")


def decrypt_secret(encrypted_value: str) -> str:
    """Decrypt a secret value.

    Args:
        encrypted_value: Base64-encoded encrypted value

    Returns:
        The plaintext secret value

    Raises:
        SecretsError: If decryption fails
    """
    try:
        fernet = _get_fernet()
        decrypted = fernet.decrypt(encrypted_value.encode("utf-8"))
        return decrypted.decode("utf-8")
    except Exception as e:
        raise SecretsError(f"Failed to decrypt secret: {e}") from e


def rotate_encryption_key(
    old_encrypted_values: list[str],
    old_key_material: str,
    new_key_material: str,
) -> list[str]:
    """Re-encrypt values with a new key.

    Used when rotating the SECRETS_KEY.

    Args:
        old_encrypted_values: List of encrypted values
        old_key_material: The old SECRETS_KEY value
        new_key_material: The new SECRETS_KEY value

    Returns:
        List of newly encrypted values
    """
    # Create old Fernet
    old_hash = hashlib.sha256(old_key_material.encode()).digest()
    old_key = base64.urlsafe_b64encode(old_hash)
    old_fernet = Fernet(old_key)

    # Create new Fernet
    new_hash = hashlib.sha256(new_key_material.encode()).digest()
    new_key = base64.urlsafe_b64encode(new_hash)
    new_fernet = Fernet(new_key)

    # Re-encrypt each value
    new_encrypted = []
    for encrypted in old_encrypted_values:
        plaintext = old_fernet.decrypt(encrypted.encode("utf-8"))
        new_encrypted_value = new_fernet.encrypt(plaintext)
        new_encrypted.append(new_encrypted_value.decode("utf-8"))

    return new_encrypted
