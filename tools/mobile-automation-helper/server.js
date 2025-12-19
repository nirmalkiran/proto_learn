import express from "express";
import cors from "cors";
import { exec } from "child_process";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.post("/terminal", (req, res) => {
  const { command } = req.body;

  if (!command) {
    return res.status(400).json({ success: false, error: "No command provided" });
  }

  exec(command, (error, stdout, stderr) => {
    if (error) {
      return res.json({ success: false, error: stderr || error.message });
    }
    res.json({ success: true, output: stdout });
  });
});

app.listen(5050, () => {
  console.log("Mobile Automation Helper running at http://localhost:5050");
});
