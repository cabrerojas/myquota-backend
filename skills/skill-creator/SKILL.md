---
name: skill-creator
description: >
  Guía y templatea la creación de nuevos skills para AI agents. Estandariza metadata, estructura y checklist. Incluye ejemplos y mejores prácticas.
license: MIT
metadata:
  author: myquota
  version: "1.0"
  auto_invoke:
    - "Crear skill nuevo"
    - "Agregar feature cross-cutting"
---

## Propósito

Facilitar la creación de skills nuevos, asegurando consistencia en metadata, estructura, templates y checklist.

---

## ¿Cuándo se invoca?

- Al agregar un nuevo patrón, módulo, flujo o feature cross-cutting
- Cuando skill-audit alerta que falta un skill

---

## Pasos para crear un skill

1. Crea un directorio `skills/<nombre-skill>/`
2. Crea un archivo `SKILL.md` usando el template de abajo
3. Completa metadata: name, description, auto_invoke, author, version
4. Agrega propósito, triggers, templates, reglas, checklist
5. (Opcional) Agrega ejemplos de uso
6. Corre `skill-sync` para actualizar AGENTS.md

---

## Template de SKILL.md

---
name: <nombre-skill>
description: >
  <Descripción breve del skill>
license: MIT
metadata:
  author: <tu-nombre>
  version: "1.0"
  auto_invoke:
    - "<Trigger 1>"
    - "<Trigger 2>"
---

## Propósito

<Explica el objetivo del skill>

---

## ¿Cuándo se invoca?

<Lista de triggers/acciones>

---

## Templates / Ejemplos

```typescript
// ...ejemplo de uso, patrón, etc...
```

---

## Checklist

- [ ] Metadata completa
- [ ] Propósito claro
- [ ] Triggers definidos
- [ ] Templates y ejemplos
- [ ] Checklist relevante
- [ ] Agregado a skills/ y skill-sync
