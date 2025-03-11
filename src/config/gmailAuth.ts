import { google, Auth } from "googleapis";
import readline from "readline";
import { db } from "@/config/firebase";

const SCOPES = [
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/gmail.readonly",
];

// 📌 Decodificar credenciales desde variable de entorno
function getGoogleCredentials(): Auth.OAuth2Client {
  if (!process.env.CREDENTIALS_JSON) {
    throw new Error(
      "❌ CREDENTIALS_JSON no está definido en las variables de entorno."
    );
  }

  const credentialsJson = Buffer.from(
    process.env.CREDENTIALS_JSON,
    "base64"
  ).toString("utf8");
  const credentials = JSON.parse(credentialsJson);

  const { client_secret, client_id } = credentials.installed;

  return new google.auth.OAuth2(
    client_id,
    client_secret,
    "urn:ietf:wg:oauth:2.0:oob"
  );
}

// 📌 Guardar el token de Gmail en Firestore
export async function saveTokenToFirestore(
  userId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tokens: any
): Promise<void> {
  await db
    .collection("users")
    .doc(userId)
    .collection("emailTokens")
    .doc("gmail")
    .set({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiryDate: tokens.expiry_date,
    });
}

// 📌 Obtener el token de Gmail desde Firestore
export async function getTokenFromFirestore(
  userId: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any | null> {
  const tokenDoc = await db
    .collection("users")
    .doc(userId)
    .collection("emailTokens")
    .doc("gmail")
    .get();
  return tokenDoc.exists ? tokenDoc.data() : null;
}

// 📌 Autenticar con Gmail
export async function authenticate(): Promise<Auth.OAuth2Client> {
  const oAuth2Client = getGoogleCredentials();

  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
  });

  console.warn("🔗 Autoriza la aplicación visitando este enlace:", authUrl);
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(
      "🔑 Introduce el código de autorización aquí: ",
      async (code) => {
        const { tokens } = await oAuth2Client.getToken(code);

        if (!tokens.access_token) {
          throw new Error("Error al obtener access_token de Google.");
        }

        oAuth2Client.setCredentials(tokens);
        rl.close();
        resolve(oAuth2Client);
      }
    );
  });
}
