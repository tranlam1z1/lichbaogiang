import { Router } from 'express';
import { autoTopUpEnabled, bank, bankConfigured } from '../lib/bank.js';
import { getSettings } from '../services/settings.js';

export const settingsRouter = Router();

/** Cài đặt công khai: giá xuất file, tỷ lệ nạp — frontend dùng để hiển thị và hỏi xác nhận. */
settingsRouter.get('/public', async (req, res) => {
  const s = await getSettings();
  res.json({
    freeExportsForNewUser: s.freeExportsForNewUser,
    pointsPerExport: s.pointsPerExport,
    topupUnitVnd: s.topupUnitVnd,
    pointsPerUnit: s.pointsPerUnit,
    topupEnabled: bankConfigured,
    topupAuto: autoTopUpEnabled,
    bankName: bankConfigured ? bank.bankName || bank.bankId : null,
  });
});
