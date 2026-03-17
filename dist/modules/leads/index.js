"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.leadsModule = void 0;
const leadsModule = async (app) => {
    app.get('/', async (req) => ({
        module: 'leads',
        org_id: req.org_id,
        user_id: req.user_id,
        role: req.role,
    }));
};
exports.leadsModule = leadsModule;
