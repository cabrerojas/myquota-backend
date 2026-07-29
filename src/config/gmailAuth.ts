import { google, Auth } from "googleapis";
import readline from "readline";
import { getSupabaseAdmin } from "@/config/supabase";
import { getEnv } from "@config/env.validation";
import { decrypt, getEncryptionKey } from "@/shared/lib/crypto";

const SCOPES = [
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/gmail.readonly",
];

function getGoogleCredentials(): Auth.OAuth2Client {
  const env = getEnv();
  if (!env.CREDENTIALS_JSON) {
    throw new Error(
      "CREDENTIALS_JSON no está definido en las variables de entorno.",
    );
  }

  const credentialsJson = Buffer.from(env.CREDENTIALS_JSON, "base64").toString(
    "utf8",
  );
  const credentials = JSON.parse(credentialsJson);

  const { client_secret, client_id } = credentials.installed;

  return new google.auth.OAuth2(
    client_id,
    client_secret,
    "urn:ietf:wg:oauth:2.0:oob",
  );
}

export async function saveTokenToFirestore(
  userId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tokens: any,
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("user_tokens")
    .upsert({
      user_id: userId,
      provider: "gmail",
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
    }, { onConflict: "user_id,provider" });

  if (error) {
    throw new Error(`Error saving Gmail token: ${error.message}`);
  }
}

export async function getTokenFromFirestore(
  userId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("user_tokens")
    .select("access_token, refresh_token_encrypted, expires_at")
    .eq("user_id", userId)
    .eq("provider", "gmail")
    .single();

  if (error?.code === "PGRST116") return null;
  if (error) return null;

  // Token is stored encrypted — decrypt it
  let refreshToken = null;
  const encrypted = data.refresh_token_encrypted as string | null;
  if (encrypted) {
    try {
      refreshToken = decrypt(encrypted, getEncryptionKey());
    } catch {
      console.error("[gmailAuth] Failed to decrypt refresh token");
      refreshToken = null;
    }
  }

  return {
    accessToken: data.access_token as string,
    refreshToken,
    expiryDate: data.expires_at ? new Date(data.expires_at as string).getTime() : null,
  };
}

// Autenticar con Gmail
export async function authenticate(): Promise<Auth.OAuth2Client> {
  const oAuth2Client = getGoogleCredentials();

  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
  });

  console.warn("Autoriza la aplicación visitando este enlace:", authUrl);
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question("Introduce el código de autorización aquí: ", async (code) => {
      const { tokens } = await oAuth2Client.getToken(code);

      if (!tokens.access_token) {
        throw new Error("Error al obtener access_token de Google.");
      }

      oAuth2Client.setCredentials(tokens);
      rl.close();
      resolve(oAuth2Client);
    });
  });
}
