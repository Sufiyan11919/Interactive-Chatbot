# Interactive Chatbot

A simple chatbot interface built with `Node.js`, `Express`, and vanilla HTML/CSS/JavaScript.

The app currently provides:

- A two-panel UI for chat and document management
- A chat input that sends messages to an Express backend
- A retrieval method selector with `semantic` and `tfidf` options
- A document upload panel that displays selected filenames in the UI

The backend is intentionally minimal at this stage. The `/chat` route accepts a message and retrieval method, logs them, and returns a placeholder bot response.

## Tech Stack

- Node.js
- Express
- Vanilla JavaScript
- HTML/CSS

## Project Structure

```text
Interactive-Chatbot/
├── public/
│   ├── index.html
│   ├── script.js
│   └── style.css
├── server.js
├── package.json
└── README.md
```

## Getting Started

### Prerequisites

- Node.js 18+ recommended
- npm

### Install dependencies

```bash
npm install
```

### Run the app

For normal use:

```bash
npm start
```

For development with auto-restart:

```bash
npm run dev
```

The server runs on:

```text
http://localhost:3000
```

## API

### `POST /chat`

Request body:

```json
{
  "message": "Hello",
  "retrievalMethod": "semantic"
}
```

Example response:

```json
{
  "userMessage": "Hello",
  "botResponse": "Message Received!"
}
```

## Scripts

- `npm start` - start the Express server
- `npm run dev` - start the server with `nodemon`
