# Learnings

_Captured learnings will be listed here._
- [Redeclare the discriminant field as a literal on each union variant](./redeclare-discriminant-as-literal.md) - In `src/lib/osmToScene.ts`, `BuildingPrism` / `RoadLine` / `FlatPoly` extend `MapObjectBase`, whose `kind: ObjectKind` is the broad union `'building' | 'road' |
