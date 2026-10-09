# Entidades do Projeto

Este documento descreve as entidades definidas nas models do projeto.

## User

- Coleção: `User`
- Campos:
  - `email` (String, obrigatório, único, lowercase, trim)
  - `passwordHash` (String, obrigatório, oculto na seleção)
  - `createdAt` / `updatedAt` (timestamps automáticos)

## RefreshToken

- Coleção: `RefreshToken`
- Campos:
  - `userId` (ObjectId, obrigatório, referência para `User`)
  - `token` (String, obrigatório, trim)
  - `revokedAt` (Date, padrão `null`)
  - `expiresAt` (Date, obrigatório)
  - `revokedBy` (String, padrão `null`)
  - `createdAt` / `updatedAt` (timestamps automáticos)

## Teams

- Coleção: `Teams`
- Campos:
  - `name` (String, obrigatório, único)
  - `createdAt` / `updatedAt` (timestamps automáticos)

## Vendors

- Coleção: `Vendors`
- Campos:
  - `name` (String, obrigatório)
  - `imageUrl` (String)'
  - `teamId` (ObjectId, obrigatório, referência para `Team`)
  - `job` (String, obrigatório)
  - `createdAt` / `updatedAt` (timestamps automáticos)

## Fan

- Coleção: `Fan`
- Campos:
  - `name` (String, obrigatório)
  - `teamId` (ObjectId, obrigatório, referência para `Team`)
  - `createdAt` / `updatedAt` (timestamps automáticos)

## SDR

- Coleção: `SDR`
- Campos:
  - `name` (String, obrigatório)
  - `imageUrl` (String)
  - `teamId` (ObjectId, obrigatório, referência para `Team`)
  - `job` (String, obrigatório)
  - `createdAt` / `updatedAt` (timestamps automáticos)

## Sales

- Coleção: `Sales`
- Campos:
  - `vendor` (ObjectId, obrigatório, referência para `Vendors`)
  - `value` (Number)
  - `sdrId` (ObjectId, referência para `SDR`)
  - `realizedAt` (Date, obrigatório)
  - `createdAt` / `updatedAt` (timestamps automáticos)
