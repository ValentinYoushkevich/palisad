import * as labelsService from '@/services/labels.service.js';

export async function generateLabels(req, res, next) {
  try {
    const { plantIds, layout } = req.body;
    const pdfStream = await labelsService.generateLabels(
      req.params.nurseryId,
      req.user.accountId,
      plantIds,
      layout
    );

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="labels.pdf"');
    pdfStream.pipe(res);
  } catch (err) {
    next(err);
  }
}
