"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.contactsModule = void 0;
const contactsModule = async (app) => {
    app.get('/', async (req) => ({
        module: 'contacts',
        org_id: req.org_id,
        user_id: req.user_id,
        role: req.role,
    }));
};
exports.contactsModule = contactsModule;
