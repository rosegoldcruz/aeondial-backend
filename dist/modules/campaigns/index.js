"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.campaignsModule = void 0;
const campaignsModule = async (app) => {
    app.get('/', async (req) => ({
        module: 'campaigns',
        org_id: req.org_id,
        user_id: req.user_id,
        role: req.role,
    }));
};
exports.campaignsModule = campaignsModule;
