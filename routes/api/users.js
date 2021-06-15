var mongoose = require('mongoose');
var router = require('express').Router();
var passport = require('passport');
var User = require('../../models/User');
var auth = require('../../middleware/auth');
const { check, validationResult } = require('express-validator/check');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const config = require('config');

// Get a specific user while logged in 
router.get('/:user_id', auth, async (req, res) => {
  try {
    // Find by ID takes in a single value which is the user ID that you are
    // looking for
    let user = await User.findById(req.params.user_id).select('-password');;

    if(!user){
      return res.status(404).json({ msg: 'User not found' });
    }

    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server error' });
  }
});

// Edit user profile ie Username, email and password
router.put('/:user_id', auth, async (req, res) => {

  try {
    // Check if user exists
    const user = await User.findById(req.params.user_id);

    if(!user) {
      return res.status(401).json({ msg: 'User does not exist' });
    }

    // Check for what the user has passed
    if(req.body.username) {
      user.username = req.body.username;
    } else if(req.body.email) {
      user.email = req.body.email;
    } else if(req.body.password) {
      // Encrypt password
      const salt = await bcrypt.genSalt(10);
      user.password = await bcrypt.hash(req.body.password, salt);

      // Create a JWT for the user
      const payload = {
        user: {
          id: user.id
        }
      }

      jwt.sign(
        payload,
        config.get('jwtSecret'),
        { expiresIn: 360000 },
        (err, token) => {
          if(err) throw err;
          res.json({ token })
        }
      )
    }

    // Save the user
    await user.save();

    const username = user.username;
    const email = user.email;

    const userWithoutPassword = {
      username,
      email
    };

    res.json(userWithoutPassword);

  } catch (error) {
    console.error(error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// Login with a specific user
router.post('/login', [
  check('email', 'Please enter a valid email').isEmail(),
  check('password', 'Password is required').exists()
], async (req, res, next) => {

  const errors = validationResult(req);
  if(!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { email, password } = req.body;

  try {
    let user = await User.findOne({ email });

    if(!user) {
      return res.json.status(400).json({msg: 'Invalid Credentials'});
    }

    // Compare the password that was entered with that, that was encripted
    // while registering the user
    const isMatch = await bcrypt.compare(password, user.password);

    if(!isMatch) {
      return res.status(400).json({ errors: [{ msg: 'Invalid Credentials' }] });
    }

    // Return jsonwebtoken
    const payload = {
      user: {
        id: user.id
      }
    }

    jwt.sign(
      payload, 
      config.get('jwtSecret'),
      { expiresIn: 360000 },
      (err, token) => {
        if(err) throw err;
        res.json({ token });
      }
    );
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// Register a new user

router.post('/', [
  check('username', 'Username is required').not().isEmpty(),
  check('email', 'Email is required').isEmail(),
  check(
    'password', 
    'Please enter a password with 6 or more characters'
  ).isLength({ min: 6 })
], async (req, res) => {
  // Check if there is an error in the user's input
  const errors = validationResult(req);
  if(!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() })
  }

  const { username, email, password } = req.body;


  try {
    // See if user exists
    let user = await User.findOne({ email });

    if(user) {
        return res.status(400).json({ errors: [{ msg: 'User already exists' }] });
    }

    user = new User({
      username,
      email,
      password
    });

    // Encrypt password
    const salt = await bcrypt.genSalt(10);

    user.password = await bcrypt.hash(password, salt);

    await user.save();

    // After saving a user, you create a JWT which you can
    // assign to that user
    const payload = {
      user: {
        id: user.id
      }
    }

    jwt.sign(
      payload,
      config.get('jwtSecret'),
      { expiresIn: 360000 },
      (err, token) => {
        if(err) throw err;
        res.json({ token })
      }
    );

  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

module.exports = router;
