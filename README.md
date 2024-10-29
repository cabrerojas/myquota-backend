
# Proyecto Bancario - MyQuota

Aplicación backend para manejar y visualizar transacciones financieras, incluyendo soporte para cuotas de transacciones.

## Estructura del Proyecto

```
proyecto-bancario/ 
├── src/ 
│ ├── config/ 
│ │ └── firebase.ts # Configuración de la base de datos
│ ├── controllers/
│ │ ├── transactionController.ts # Lógica de controladores para manejar transacciones 
│ │ └── quotaController.ts # Lógica de controladores para manejar cuotas 
│ ├── middlewares/
│ │ └── errorHandler.ts # Middleware para manejar errores 
│ ├── models/ 
│ │ ├── transactionModel.ts # Definición de modelos de datos (Transacciones) 
│ │ └── quotaModel.ts # Definición de modelos de datos (Cuotas) 
│ ├── routes/ 
│ │ ├── transactionRoutes.ts # Rutas para las transacciones 
│ │ └── quotaRoutes.ts # Rutas para las cuotas 
│ ├── services/ 
│ │ ├── transactionService.ts # Lógica de negocio para transacciones 
│ │ └── quotaService.ts # Lógica de negocio para cuotas 
│ ├── utils/ 
│ │ ├── validators.ts # Utilidades y validaciones de datos 
│ │ └── helpers.ts # Funciones auxiliares para operaciones comunes 
│ ├── index.ts # Punto de entrada de la aplicación 
├── .env # Variables de entorno 
├── .gitignore # Archivos a ignorar en Git 
├── tsconfig.json # Configuración de TypeScript 
├── package.json # Dependencias del proyecto 
└── README.md # Documentación del proyecto               
```

## Configuración

1. **Archivo `.env`**: Crea un archivo `.env` en el directorio raíz y agrega las siguientes variables de entorno:

   ```plaintext
   FIREBASE_DB_URL=URL_de_tu_base_de_datos_firebase
   PORT=3000
   ```

2. **Credenciales de Firebase**: Coloca el archivo `serviceAccountKey.json` en el directorio `src/config` para la autenticación de Firebase. Este archivo contiene las credenciales necesarias para que el backend se conecte a Firestore.

3. **Ejecución en Desarrollo**: Usa el siguiente comando para ejecutar el proyecto en modo de desarrollo:
   ```bash
   npm run dev
   ```

## Endpoints

### Transacciones

- **GET /api/transactions**: Obtener todas las transacciones.
- **POST /api/transactions**: Crear una nueva transacción.
- **GET /api/transactions/:id**: Obtener una transacción específica por ID.
- **PUT /api/transactions/:id**: Actualizar una transacción existente por ID.
- **DELETE /api/transactions/:id**: Eliminar una transacción por ID.

### Cuotas

- **GET /api/quotas**: Obtener todas las cuotas.
- **POST /api/quotas**: Crear una nueva cuota.
- **GET /api/quotas/:id**: Obtener una cuota específica por ID.
- **PUT /api/quotas/:id**: Actualizar una cuota existente por ID.
- **DELETE /api/quotas/:id**: Eliminar una cuota por ID.

## Scripts Disponibles

- **`npm run dev`**: Inicia el servidor en modo de desarrollo.
- **`npm run build`**: Compila el proyecto TypeScript.
- **`npm start`**: Inicia el servidor usando el código compilado.

## Dependencias Principales

- **firebase-admin**: SDK de Firebase para acceso a Firestore y autenticación.
- **express**: Framework para construir la API REST.
- **typescript**: Superconjunto de JavaScript que añade tipado estático.
