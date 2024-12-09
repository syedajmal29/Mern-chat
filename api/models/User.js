const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema(
  {
    username: { type: String, unique: true },
    password: { type: String }, // It's good practice to explicitly define the type
  },
  { timestamps: true }
);

// The second parameter should be the schema object, not its name as a string
const UserModel = mongoose.model('User', UserSchema);

module.exports = UserModel; // Correct export for Node.js
