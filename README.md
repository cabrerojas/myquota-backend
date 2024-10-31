
# Proyecto Bancario - MyQuota

Aplicación backend para manejar y visualizar transacciones financieras, incluyendo soporte para cuotas de transacciones.

## Estructura del Proyecto "feature-based" o "modular-based" 

```
myquota-backend/
├── src/
│   ├── modules/
│   │   ├── transactions/
│   │   │   ├── transaction.controller.ts       # Controlador para transacciones
│   │   │   ├── transaction.model.ts            # Modelo de datos para transacciones
│   │   │   ├── transaction.routes.ts           # Rutas de transacciones
│   │   │   ├── transaction.service.ts          # Servicios para transacciones
│   │   │   └── transaction.validators.ts       # Validadores específicos para transacciones
│   │   ├── quotas/
│   │   │   ├── quota.controller.ts             # Controlador para cuotas
│   │   │   ├── quota.model.ts                  # Modelo de datos para cuotas
│   │   │   ├── quota.routes.ts                 # Rutas de cuotas
│   │   │   ├── quota.service.ts                # Servicios para cuotas
│   │   │   └── quota.validators.ts             # Validadores específicos para cuotas
│   ├── config/
│   │   ├── firebase.ts                         # Configuración de Firebase y base de datos
│   │   └── gmailAuth.ts                        # Configuración de API gmail.
│   ├── middlewares/
│   │   └── errorHandler.ts                     # Middleware para manejo de errores
│   ├── utils/
│   │   └── *.ts                                # Utilidades comunes
│   └── index.ts                                # Punto de entrada de la aplicación
├── .env                                        # Variables de entorno
├── .gitignore                                  # Archivos a ignorar en Git
├── eslint.config.mjs                           # Configuraciones de ESlint
├── tsconfig.json                               # Configuración de TypeScript
├── package.json                                # Dependencias del proyecto
└── README.md                                   # Documentación del proyecto      
```

## Configuración

1. **Instalar Dependencias**:
   ```bash
   npm install
   ```

2. **Archivo `.env`**: Crea un archivo `.env` en el directorio raíz y agrega las siguientes variables de entorno:

   ```plaintext
   FIREBASE_DB_URL=URL_de_tu_base_de_datos_firebase
   PORT=3000
   ```

3. **Credenciales de Firebase**: Coloca el archivo `serviceAccountKey.json` en el directorio `src/config` para la autenticación de Firebase. Este archivo contiene las credenciales necesarias para que el backend se conecte a Firestore.

4. **Credenciales de API gmail**: Coloca el archivo `credentials.json` en el directorio `src/config` para la autenticación de API Gmail. Este archivo contiene las credenciales necesarias para que el backend se conecte a los correos.


5. **Ejecución en Desarrollo**: Usa el siguiente comando para ejecutar el proyecto en modo de desarrollo:
   ```bash
   npm run dev
   ```

# Configuración de Archivos de Credenciales

## 1. Obtener el archivo `serviceAccountKey.json` de Firebase

   1. Dirígete a la [Consola de Firebase](https://console.firebase.google.com/).
   2. Ve a **Configuración del Proyecto** (ícono de engranaje) y selecciona **Cuentas de servicio**.
   3. Selecciona **Generar nueva clave privada**, confirma, y descarga el archivo JSON con las credenciales.
   4. Guarda este archivo como `serviceAccountKey.json` y colócalo en el directorio `src/config` de tu proyecto.

## 2. Configurar las credenciales de Gmail (`credentials.json`)

   1. Ingresa a [Google Cloud Console](https://console.cloud.google.com/) y crea un proyecto o selecciona uno existente.
   2. Activa la **API de Gmail** en la sección de **API y Servicios**.
   3. Ve a **Credenciales** y selecciona **Crear credenciales**.
   4. Elige "ID de cliente de OAuth 2.0" o "Cuenta de servicio" y sigue los pasos para configurarlo.
   5. Descarga el archivo JSON, que será tu `credentials.json`, y colócalo en el directorio `src/config` de tu proyecto.

## Endpoints

### Transacciones

- **GET /api/transactions**: Obtener todas las transacciones.
- **POST /api/transactions**: Crear una nueva transacción.
- **GET /api/transactions/:id**: Obtener una transacción específica por ID.
- **PUT /api/transactions/:id**: Actualizar una transacción existente por ID.
- **DELETE /api/transactions/:id**: Eliminar una transacción por ID.
- **POST /api/transactions/import-bank-transactions**: Trae las transacciones enviadas al correo del mes.

### Cuotas

- **GET /api/quotas**: Obtener todas las cuotas.
- **POST /api/quotas**: Crear una nueva cuota.
- **GET /api/quotas/:id**: Obtener una cuota específica por ID.
- **PUT /api/quotas/:id**: Actualizar una cuota existente por ID.
- **DELETE /api/quotas/:id**: Eliminar una cuota por ID.
- **POST /api/quotas/initialize-by-transaction/:transactionId**: Genera cuota a partir de transacción.
- **PATCH /api/quotas/:quotaId/pay**: Marca cuota como pagada.

## Scripts Disponibles

- **`npm run dev`**: Inicia el servidor en modo de desarrollo.
- **`npm run build`**: Compila el proyecto TypeScript.
- **`npm run lint`**: Inicia ESlint.
- **`npm start`**: Inicia el servidor usando el código compilado.

## Dependencias Principales

- **firebase-admin**: SDK de Firebase para acceso a Firestore y autenticación.
- **fireorm**: ORM para firestore.
- **express**: Framework para construir la API REST.
- **typescript**: Superconjunto de JavaScript que añade tipado estático.
