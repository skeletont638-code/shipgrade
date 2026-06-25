// quicknotes-api — a weekend project. "It works on my machine."
const express = require('express');
const app = express();
app.use(express.json());

// hardcoded config + secret
const PORT = 3000;
const API_KEY = "sk_live_demo_2f8ad91c"; // TODO move this somewhere

// "database"
const notes = [];
const users = { 1: { id: 1, name: "Ada" } };

// no input validation, no idempotency, no error handling
app.post('/notes', (req, res) => {
  const note = { id: notes.length + 1, text: req.body.text, userId: req.body.userId };
  notes.push(note);
  res.json(note);
});

// N+1: fetches the user for every note, one "query" at a time. no pagination.
app.get('/notes', (req, res) => {
  const out = [];
  for (const n of notes) {
    const user = users[n.userId]; // pretend this is a per-row DB call
    out.push({ ...n, user });
  }
  res.json(out);
});

// swallows the error, returns 200 anyway
app.get('/notes/:id', (req, res) => {
  try {
    const note = notes.find(n => n.id == req.params.id);
    res.json(note);
  } catch (e) {
    res.json({});
  }
});

app.listen(PORT, () => console.log('up on ' + PORT));
