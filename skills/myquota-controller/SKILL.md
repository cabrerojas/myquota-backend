---
name: myquota-controller
description: >
  Patrones de controllers: arrow functions, try/catch, manejo de errores, códigos HTTP.
  Trigger: Cuando se crea un controller, se agrega un endpoint, o se necesita manejo de errores.
license: MIT
metadata:
  author: myquota
  version: "1.0"
  auto_invoke:
    - "Creating a controller"
    - "Adding an endpoint"
    - "Handling errors in controllers"
---

## Propósito

Crear controllers en MyQuota siguiendo el patrón de arrow functions con try/catch consistente.

---

## Patrón Base

```typescript
import { Request, Response } from "express";
import { MyEntityService } from "./myEntity.service";

export class MyEntityController {
  constructor(private readonly service: MyEntityService) {}

  getAll = async (_req: Request, res: Response): Promise<void> => {
    try {
      const items = await this.service.findAll();
      res.status(200).json(items);
    } catch (error) {
      console.error("Error getting items:", error);
      res.status(500).json({
        message: "Error al obtener items",
        error: error instanceof Error ? error.message : "Error desconocido",
      });
    }
  };
}
```

---

## Pattern: Arrow Functions

**SIEMPRE** usar arrow functions para evitar problemas con `this`:

```typescript
// ✅ CORRECTO — arrow function
getById = async (req: Request, res: Response): Promise<void> => {
  // this.service está correctamente bound
};

// ❌ INCORRECTO — método regular
async getById(req: Request, res: Response): Promise<void> {
  // this.service puede ser undefined cuando se pasa como callback
}
```

---

## Pattern: Try/Catch

**SIEMPRE** try/catch en cada método. El catch debe:

1. `console.error` con contexto descriptivo
2. Extraer mensaje: `error instanceof Error ? error.message : "Error desconocido"`
3. Responder con JSON: `{ message, error }`

```typescript
getById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { itemId } = req.params;
    const item = await this.service.findById(itemId);

    if (!item) {
      res.status(404).json({ message: "Item no encontrado" });
      return;
    }

    res.status(200).json(item);
  } catch (error) {
    console.error("Error getting item:", error);
    res.status(500).json({
      message: "Error al obtener el item",
      error: error instanceof Error ? error.message : "Error desconocido",
    });
  }
};
```

---

## Pattern: Parámetros No Usados

Prefijo `_` para parámetros no utilizados:

```typescript
// req no se usa
getAll = async (_req: Request, res: Response): Promise<void> => {
  // ...
};
```

---

## Códigos de Respuesta HTTP

| Operación        | Éxito | Not Found | Client Error | Server Error |
| ---------------- | ----- | --------- | ------------ | ------------ |
| GET (lista)      | 200   | —         | 400          | 500          |
| GET (por ID)     | 200   | 404       | 400          | 500          |
| POST (crear)     | 201   | —         | 400          | 500          |
| PUT (actualizar) | 200   | 404       | 400          | 500          |
| DELETE           | 200   | 404       | —            | 500          |

---

## Templates por Operación

### GET All

```typescript
getAll = async (_req: Request, res: Response): Promise<void> => {
  try {
    const items = await this.service.findAll();
    res.status(200).json(items);
  } catch (error) {
    console.error("Error getting items:", error);
    res.status(500).json({
      message: "Error al obtener items",
      error: error instanceof Error ? error.message : "Error desconocido",
    });
  }
};
```

### GET by ID

```typescript
getById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { itemId } = req.params;
    const item = await this.service.findById(itemId);

    if (!item) {
      res.status(404).json({ message: "Item no encontrado" });
      return;
    }

    res.status(200).json(item);
  } catch (error) {
    console.error("Error getting item:", error);
    res.status(500).json({
      message: "Error al obtener el item",
      error: error instanceof Error ? error.message : "Error desconocido",
    });
  }
};
```

### POST Create

```typescript
create = async (req: Request, res: Response): Promise<void> => {
  try {
    const item = await this.service.create(req.body);
    res.status(201).json(item);
  } catch (error) {
    console.error("Error creating item:", error);
    res.status(500).json({
      message: "Error al crear item",
      error: error instanceof Error ? error.message : "Error desconocido",
    });
  }
};
```

### PUT Update

```typescript
update = async (req: Request, res: Response): Promise<void> => {
  try {
    const { itemId } = req.params;
    const updated = await this.service.update(itemId, req.body);

    if (!updated) {
      res.status(404).json({ message: "Item no encontrado" });
      return;
    }

    res.status(200).json({
      message: "Item actualizado exitosamente",
      data: updated,
    });
  } catch (error) {
    console.error("Error updating item:", error);
    res.status(500).json({
      message: "Error al actualizar item",
      error: error instanceof Error ? error.message : "Error desconocido",
    });
  }
};
```

### DELETE

```typescript
delete = async (req: Request, res: Response): Promise<void> => {
  try {
    const { itemId } = req.params;
    const deleted = await this.service.softDelete(itemId);

    if (!deleted) {
      res.status(404).json({ message: "Item no encontrado" });
      return;
    }

    res.status(200).json({ message: "Item eliminado exitosamente" });
  } catch (error) {
    console.error("Error deleting item:", error);
    res.status(500).json({
      message: "Error al eliminar item",
      error: error instanceof Error ? error.message : "Error desconocido",
    });
  }
};
```

---

## Anti-patterns

```typescript
// ❌ Pasar objeto error raw a JSON
res.status(500).json({ error }); // Puede exponer stack traces

// ❌ Lógica de negocio en controller
const total = items.reduce((sum, i) => sum + i.amount, 0); // Esto va en service

// ❌ Método regular (no arrow function)
async getAll(req: Request, res: Response) { }

// ❌ Sin try/catch
getAll = async (req, res) => {
  const items = await this.service.findAll(); // Si falla, error no capturado
  res.json(items);
};

// ❌ catch vacío
catch (error) {
  // Silencioso — sin log ni respuesta
}
```

---

## Checklist

- [ ] Todos los métodos son arrow functions (`= async () =>`)
- [ ] try/catch en cada método
- [ ] Errores usan `error instanceof Error ? error.message : "Error desconocido"`
- [ ] `console.error` con contexto en cada catch
- [ ] Códigos HTTP correctos (200, 201, 404, 500)
- [ ] Params no usados tienen prefijo `_`
- [ ] NO hay lógica de negocio en el controller
- [ ] Respuestas JSON consistentes
