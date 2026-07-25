import * as inventorySessionService from '@/services/inventorySession.service.js';

// Контроллеры сессий инвентаризации (§ «Инвентаризация», Э2) — тонкие: тянут nurseryId из
// params, userId из req.user, делегируют в сервис, отдают JSON. Идемпотентный повтор
// (created=false) отвечает 200, свежая вставка — 201 (FIXED-контракт).

export async function create(req, res, next) {
  try {
    const { detail, created } = await inventorySessionService.createSession(
      req.params.nurseryId,
      req.user.userId,
      req.body
    );
    res.status(created ? 201 : 200).json(detail);
  } catch (err) {
    next(err);
  }
}

export async function list(req, res, next) {
  try {
    const result = await inventorySessionService.listSessions(req.params.nurseryId, req.query);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function getById(req, res, next) {
  try {
    const detail = await inventorySessionService.getSession(req.params.nurseryId, req.params.id);
    res.json(detail);
  } catch (err) {
    next(err);
  }
}

// Применить расхождения сессии (Э3): списать выбранные «пропавшие» и вернуть выбранных
// «чужих». Тонкий: отдаёт FIXED-контракт { applied: { writtenOff, transferred }, skipped }.
export async function apply(req, res, next) {
  try {
    const result = await inventorySessionService.applySession(
      req.params.nurseryId,
      req.user.userId,
      req.params.id,
      req.body
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
}

// PDF-акт инвентаризации (Э4): стримим сгенерированный PDF (как labels.controller —
// заголовки Content-Type/Content-Disposition + pdf.pipe(res)). Доступ любой роли питомника.
export async function act(req, res, next) {
  try {
    const pdf = await inventorySessionService.generateAct(req.params.nurseryId, req.params.id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="inventory-act-${req.params.id}.pdf"`);
    pdf.pipe(res);
  } catch (err) {
    next(err);
  }
}
