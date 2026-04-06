---
name: skill-audit
description: >
  Audita y sugiere/actualiza skills existentes tras cambios en patrones, convenciones o arquitectura. Detecta drift entre el codebase y la documentación de skills, y alerta si se requiere crear un skill nuevo.
license: MIT
metadata:
  author: myquota
  version: "1.0"
  auto_invoke:
    - "QA Checklist"
    - "Antes de crear PR"
    - "Al modificar patrones globales"
---

## Propósito

Evitar drift entre el codebase y los skills documentados. Detecta si los cambios recientes afectan patrones documentados en algún skill, sugiere/aplica actualizaciones y alerta si falta crear un skill nuevo.

---

## ¿Cuándo se invoca?

- Antes de crear un PR (QA Checklist)
- Al modificar AGENTS.md, copilot-instructions.md, o skills existentes
- Al agregar un nuevo patrón global

---

## ¿Qué hace?

1. Analiza los cambios recientes (diff, PR, staged files)
2. Detecta si afectan patrones documentados en skills (estructura, reglas, templates, checklists)
3. Sugiere/aplica actualizaciones a los SKILL.md afectados
4. Alerta si se requiere crear un skill nuevo (nuevo patrón, módulo, flujo)
5. Recomienda correr `skill-sync` si se modificó metadata.auto_invoke

---

## Ejemplo de uso

- Modificaste la estructura de módulos → skill-audit detecta que myquota-module y myquota-routes deben actualizarse
- Cambiaste la validación de env vars → skill-audit sugiere actualizar AGENTS.md y myquota-auth
- Agregaste un nuevo flujo (ej: notificaciones) → skill-audit alerta que falta crear skill `myquota-notifications`

---

## Checklist

- [ ] ¿Todos los skills reflejan los patrones actuales?
- [ ] ¿Hay drift entre codebase y skills?
- [ ] ¿Falta crear un skill nuevo?
- [ ] ¿Se debe correr skill-sync para actualizar AGENTS.md?
