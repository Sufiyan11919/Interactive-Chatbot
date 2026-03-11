// 2.1 Import Express
const express = require("express");

// 2.2 Initialize an Express app
const app = express();

// Middleware to parse JSON request bodies
app.use(express.json());

// 2.3 Serve static files from the public folder
app.use(express.static("public"));

// 2.5 Listen on port 3000
app.listen(3000, () => {
  console.log("Server is running on http://localhost:3000");
});
