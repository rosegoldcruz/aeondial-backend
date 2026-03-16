import express from "express";
import cors from "cors";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import dotenv from "dotenv";

dotenv.config();

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const app = express();
app.use(cors());
app.use(express.json());

const server = createServer(app);
export const wss = new WebSocketServer({ server });

app.use((req, res, next) => {
  const orgId = req.headers["x-org-id"];
  if (!orgId) return res.status(401).json({ error: "Missing org_id" });
  req.orgId = orgId;
  next();
});

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.get("/leads", async (req, res) => {
  const leads = await prisma.lead.findMany({
    where: { org_id: req.orgId },
    include: { contact: true },
  });
  res.json(leads);
});

app.post("/leads", async (req, res) => {
  const { name, phone, email, source, estimatedValue } = req.body;

  const contact = await prisma.contact.create({
    data: {
      org_id: req.orgId,
      name,
      phone,
      email,
    },
  });

  const lead = await prisma.lead.create({
    data: {
      org_id: req.orgId,
      contactId: contact.id,
      source,
      estimatedValue,
    },
  });

  res.status(201).json(lead);
});

server.listen(process.env.PORT, () => {
  console.log(`AEON backend running on port ${process.env.PORT}`);
});
