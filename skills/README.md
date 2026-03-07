# AI Agent Skills — MyQuota Backend

Este directorio contiene **Agent Skills** que proporcionan patrones específicos del proyecto para asistentes de IA (GitHub Copilot, Claude, etc.).

## ¿Qué son los Skills?

Los Skills enseñan a los agentes IA cómo realizar tareas específicas en este proyecto. Cuando un agente carga un skill, obtiene contexto sobre:

- Reglas críticas (qué hacer siempre / qué nunca hacer)
- Patrones de código y convenciones
- Templates y ejemplos
- Referencias a documentación local

## Setup

Ejecuta el script de setup para configurar los skills:

```bash
./skills/setup.sh
```

Esto copia `AGENTS.md` a `.github/copilot-instructions.md` para compatibilidad con GitHub Copilot.

## Cómo usar los Skills

Los skills se invocan automáticamente según la tarea. Ver la tabla **Auto-invoke Skills** en `AGENTS.md` para saber cuándo se activa cada uno.

También puedes invocar un skill manualmente:

```
Lee skills/myquota-module/SKILL.md
```

## Skills Disponibles

### MyQuota-Specific Skills

| Skill                | Descripción                                 |
| -------------------- | ------------------------------------------- |
| `myquota-module`     | Crear módulos completos (model→routes)      |
| `myquota-repository` | FirestoreRepository patterns                |
| `myquota-service`    | Patrones de servicios y BaseService         |
| `myquota-controller` | Controllers con try/catch y arrow functions |
| `myquota-routes`     | DI por request con res.locals               |
| `myquota-auth`       | JWT auth, middleware, refresh tokens        |
| `myquota-dates`      | Chile timezone, ISO strings                 |
| `myquota-cache`      | 3-level cache (L1→L2→L3)                    |
| `sync-types`         | Sincronizar tipos backend→frontend          |

### Meta Skills

| Skill        | Descripción                                |
| ------------ | ------------------------------------------ |
| `skill-sync` | Sincroniza Auto-invoke tables en AGENTS.md |

## Estructura de Directorio

```
skills/
├── README.md              # Este archivo
├── setup.sh               # Configura skills para diferentes herramientas IA
├── skill-sync/
│   ├── SKILL.md           # Instrucciones del skill
│   └── assets/sync.sh     # Script de sincronización
├── myquota-module/
│   └── SKILL.md
├── myquota-repository/
│   └── SKILL.md
└── ...
```

## Crear Nuevos Skills

1. Crear directorio: `skills/{skill-name}/`
2. Agregar `SKILL.md` con frontmatter requerido
3. Agregar `metadata.auto_invoke` si debe activarse automáticamente
4. Ejecutar `./skills/skill-sync/assets/sync.sh` para actualizar AGENTS.md
5. Ejecutar `./skills/setup.sh` para actualizar copilot-instructions.md

### Checklist para nuevo Skill

- [ ] `SKILL.md` con frontmatter YAML válido
- [ ] Campo `name` coincide con nombre del directorio
- [ ] Campo `description` incluye trigger phrase
- [ ] `metadata.auto_invoke` definido si aplica
- [ ] Ejecutar sync.sh después de crear

## Principios de Diseño

- **Conciso**: Solo incluir lo que el agente no sabe
- **Divulgación progresiva**: Apuntar a docs detallados, no duplicar
- **Reglas críticas primero**: Empezar con patrones SIEMPRE/NUNCA
- **Ejemplos mínimos**: Mostrar patrones, no tutoriales
