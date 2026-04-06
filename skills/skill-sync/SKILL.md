---
name: skill-sync
description: >
  Sincroniza las tablas Auto-invoke en AGENTS.md con el metadata de los skills.
  Trigger: Cuando se crea/modifica un skill, se actualiza metadata.auto_invoke, o se ejecuta sync.sh.
license: MIT
metadata:
  author: myquota
  version: "1.0"
  auto_invoke:
    - "After creating/modifying a skill"
    - "Regenerate AGENTS.md Auto-invoke tables"
    - "Troubleshoot why a skill is missing from auto-invoke"
---

## Propósito

Mantiene las secciones Auto-invoke de `AGENTS.md` sincronizadas con el metadata de cada skill. Cuando creas o modificas un skill, ejecuta el script de sincronización para actualizar automáticamente las tablas en AGENTS.md.

---

## Metadata Requerido en Skills

Cada skill que debe aparecer en la tabla Auto-invoke necesita estos campos en el frontmatter:

```yaml
metadata:
  auto_invoke:
    - "Creating a new module"
    - "Adding model.ts, repository.ts, etc."
```

`auto_invoke` puede ser un string único o una lista de acciones.

---

## Uso

```bash
# Sincronizar AGENTS.md
./skills/skill-sync/assets/sync.sh

# Dry run (mostrar qué cambiaría sin modificar)
./skills/skill-sync/assets/sync.sh --dry-run
```

---

## Cómo funciona sync.sh

1. Busca todos los archivos `skills/*/SKILL.md`
2. Extrae `name` y `metadata.auto_invoke` del frontmatter YAML
3. Genera tabla Markdown ordenada alfabéticamente por acción
4. Reemplaza la sección `### Auto-invoke Skills` en `AGENTS.md`

---

## Checklist después de modificar Skills

- [ ] Agregué `metadata.auto_invoke` al skill nuevo/modificado
- [ ] Ejecuté `./skills/skill-sync/assets/sync.sh`
- [ ] Verifiqué que AGENTS.md se actualizó correctamente
- [ ] Ejecuté `./skills/setup.sh` para actualizar copilot-instructions.md
