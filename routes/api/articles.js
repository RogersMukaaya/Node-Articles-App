var router = require('express').Router();
var mongoose = require('mongoose');
const Article = require('../../models/Article');
var Comment = mongoose.model('Comment');
var User = mongoose.model('User');
var auth = require('../../middleware/auth');
const { check, validationResult } = require('express-validator/check');
const { findById } = require('../../models/Article');


// Create an article, you can only create one if at all
// you are already a user
router.post('/', [
  check('title', 'Title is requied').not().isEmpty(),
  check('description', 'Description is requied').not().isEmpty(),
  check('body', 'Body is requied').not().isEmpty(),
], auth, async (req, res) => {
  // Check if there are no errors in terms of the data being
  // sent. If there are any errors, then they will be enclosed in
  // the errors variable which we can thereafter turn into an array
  // and return it.
  const errors = validationResult(req);
  if(!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const {title, description, body} = req.body;

  try {
    // Check if the user does exist, if we do want to check
    // if the user accessing a protected route has an account,
    // then we can his id that is tied to the request after decording
    // the JWT being used to access the route
    const user = await User.findById(req.user.id).select('-password');

    const article = new Article({
      title,
      description,
      body,
      author: req.user.id
    });

    await article.save();
    res.json({ article });
  } catch (error) {
    console.log(error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// return a article
router.get('/:article_id', auth, async (req, res) => {
  // Check if the user trying to the access this route
  // is logged in.
  // try catch blocks help you to test code for errors
  // and handle those errors
  try {
    let user = await User.findById(req.user.id);
    
    if(!user) {
      return res.status(401).json({ msg: 'Invalid Credentials' })
    }

    // Check if the article being requested for belongs
    // to the loggedin user
    let articleId = req.params.article_id;

    let article = await Article.findById(articleId);

    if(!article) {
      return res.status(404).json({ msg: 'Article not found' });
    }

    if(req.user.id.toString() === article.author.toString()) {
      res.json(article);
    } else {
      return res.status(404).json({ msg: 'Article not found' });
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({ msg: 'Server error' });
  }
  // let user = await User.findById(req.user.id);
  // Promise.all([
  //   req.payload ? User.findById(req.payload.id) : null,
  //   req.article.populate('author').execPopulate()
  // ]).then(function(results){
  //   var user = results[0];

  //   return res.json({article: req.article.toJSONFor(user)});
  // }).catch(next);
});

// update article
router.put('/:article_id', auth, async (req, res) => {

  try {
    // Check if the user is logged in. What this means is that we check in the
    // the user's collection for a document's id that matches the one we are
    // passing in. 
    const user = await User.findById(req.user.id);

    if(!user) {
      return res.status(401).json({ msg: 'Access Denied' });
    }

    let article = await Article.findById(req.params.article_id);

    if(!article) {
      return res.status(404).json({ msg: 'Article not found' });
    }

    // Check if the article that is being edited belongs to the
    // user that is logged in
    if(req.user.id.toString() === article.author.toString()) {
      // Get whatever has been passed by the user from the request
      // and check for the info passed
      if(req.body.title) {
        article.title = req.body.title;
      } else if(req.body.description) {
        article.description = req.body.description;
      } else if(req.body.body) {
        article.description = req.body.body;
      }

      await article.save();
      
      res.json(article);
    } else {
      console.log('There is no article found');
      return res.status(404).json({ msg: 'Article not found' });
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({ msg: 'Server error' });
  }
});

// delete article
router.delete('/:article_id', auth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);

    if(!user) {
      return res.status(401).json({ msg: 'Access Denied' });
    }

    const article = await Article.findById(req.params.article_id);

    if(!article) {
      return res.status(404).json({ msg: 'Article not Found' });
    }

    // This extra step of checking whether the article being accessed
    // belongs to the loggedin user might not be neccessary since for the
    // user to access any article then they have to be logged in which makes no
    // sense to recheck if any article being accessed belongs to them, we just have to
    // check if the article exists
    if(req.user.id.toString() === article.author.toString()) {
      await Article.remove({ _id: article._id });
      res.json({ msg: 'Article removed' });
    }

  } catch (error) {
    console.error(error);
    return res.status(500).json({ msg: 'Server error' });
  }
});

// Like an article
router.put('/like/:article_id', auth, async (req, res) => {

  try {
    const user = await User.findById(req.user.id);

    if(!user) {
      return res.status(401).json({ msg: 'Invalid Credentials' });
    }

    const article = await Article.findById(req.params.article_id);

    if(!article) {
      return res.status(404).json({ msg: 'Article not found' });
    }

    //Check if a post has already been liked by the logged in user
    if(article.likes.filter(like => like.user.toString() === req.user.id).length > 0) {
      return res.status(400).json({ msg: 'Article already liked' });
    }

    // Add a like to an article
    article.likes.push({ user: req.user.id });

    await article.save();

    res.json(article.likes);
  } catch (error) {
    console.error('Server Error');
    return res.status(500).json({ msg: 'Server Error' });
  }
});

// Unlike an article
router.put('/unlike/:article_id', auth, async (req, res) => {

  try {
    // Get the article
    const article = await Article.findById(req.params.article_id);

    if(!article) {
      return res.status(404).json({ msg: 'Article not found' });
    }

    // //Check if the article being unliked was liked by the loggedin user
    if(article.likes.filter(like => like.user.toString() === req.user.id).length === 0) {
      return res.status(400).json({ msg: "Article hasn't been liked yet" });
    }

    // Remember .indexOf finds the index of a specific element in an array but in order
    // to get that index, you must pass in the real element hence stringfying all the likes
    // in order to find the index of one that matches the like of the currently liked
    const removeIndex = article.likes.map(like => like.user.toString()).indexOf(req.user.id);

    // //Unlike article
    article.likes.splice(removeIndex, 1);

    // Save article
    await article.save();

    res.json(article);
  } catch (error) {
    console.error('Server Error');
    return res.status(500).json({ msg: 'Server Error' });
  }
});

// Add a comment to an article
router.post('/comments/:article_id', [
  auth,
  check('text', 'Enter a comment').not().isEmpty()
], async (req, res) => {
  console.log('here');
  // Check if the required data has been sent
  const errors = validationResult(req);

  if(!errors.isEmpty()) {
    console.log(errors);
    res.status(400).json({ errors: errors.array() });
  }

  const text = req.body.text;

  try {
    const article = await Article.findById(req.params.article_id);

    if(!article) {
      return res.status(404).json({ msg: 'Article not found' });
    }

    const comment = {
      user: req.user.id,
      text: text
    };

    article.comments.unshift(comment);

    await article.save();

    res.json(article);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ msg: 'Server Error' });
  }
});

// Get all comments related to a specific article
router.get('/comments/:article_id', auth, async (req, res) => {
  try {
    const article = await Article.findById(req.user.id);
    if(!article) {
      res.status(404).json({ msg: 'Article not found' });
    }

    res.json(article.comments);

  } catch (error) {
    console.log('Server Error');
    res.status(500).json({ msg: 'Server Error' });
  }
});

module.exports = router;
