import { db } from "@/config/firebase";
import crypto from "crypto";

const REVOKED_TOKENS_COLLECTION = "revokedTokens";

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export class RevokedTokenRepository {
  async revoke(token: string, expiresAt: Date): Promise<void> {
    const tokenHash = hashToken(token);
    await db.collection(REVOKED_TOKENS_COLLECTION).doc(tokenHash).set({
      tokenHash,
      revokedAt: new Date().toISOString(),
      expiresAt: expiresAt.toISOString(),
    });
  }

  async isRevoked(token: string): Promise<boolean> {
    const tokenHash = hashToken(token);
    const doc = await db
      .collection(REVOKED_TOKENS_COLLECTION)
      .doc(tokenHash)
      .get();
    return doc.exists;
  }
}
