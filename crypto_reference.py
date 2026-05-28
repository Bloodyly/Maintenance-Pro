# -*- coding: utf-8 -*-
import base64, hashlib
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

# 1. PBKDF2 Schlüsselableitung (genau wie in der Android-App)
def derive_key(codeword: str) -> bytes:
    salt = b"ENO_AUSLOESELISTE_v1"
    return hashlib.pbkdf2_hmac("sha256", codeword.encode("utf-8"), salt, 100000, 32)

# 2. Verschlüsselung (liefert Base64 Wire-Format: iv + ciphertext + tag)
def encrypt(plain_text: str, codeword: str, fixed_iv: bytes = None) -> str:
    key = derive_key(codeword)
    iv = fixed_iv if fixed_iv is not None else AESGCM.generate_nonce(12)
    aesgcm = AESGCM(key)
    # encrypt hängt das 16-Byte Auth-Tag automatisch hinten an!
    ciphertext_with_tag = aesgcm.encrypt(iv, plain_text.encode("utf-8"), None)
    return base64.b64encode(iv + ciphertext_with_tag).decode("utf-8")

# 3. Entschlüsselung (erwartet Base64 Wire-Format)
def decrypt(wire_b64: str, codeword: str) -> str:
    key = derive_key(codeword)
    data = base64.b64decode(wire_b64)
    iv, ciphertext_with_tag = data[:12], data[12:]
    aesgcm = AESGCM(key)
    return aesgcm.decrypt(iv, ciphertext_with_tag, None).decode("utf-8")

# --- VERIFIKATION MIT TEST-VEKTOR ---
if __name__ == "__main__":
    codeword = "MeinGeheimesCodewort123!"
    plaintext = '{"user":"tech","pass":"123"}'
    fixed_iv = b"\x00" * 12 # 12 Bytes all-zero für Testvektor-Stabilität
    
    # 1. Test Key-Ableitung
    key = derive_key(codeword)
    print(f"Abgeleiteter Key (Hex, 32 Byte):  {key.hex()}")
    
    # 2. Test Verschlüsselung
    wire_format = encrypt(plaintext, codeword, fixed_iv)
    print(f"Erwarteter Base64-Wire-Format:     {wire_format}")
    
    # 3. Test Entschlüsselung
    decoded = decrypt(wire_format, codeword)
    print(f"Erfolgreich entschlüsselt:         {decoded}")
    assert decoded == plaintext, "Fehler: Testvektor-Fehlschlag!"
