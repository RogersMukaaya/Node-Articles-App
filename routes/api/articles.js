var router = require('express').Router();
var mongoose = require('mongoose');
const Article = require('../../models/Article');
var Comment = mongoose.model('Comment');
var User = mongoose.model('User');
var auth = require('../../middleware/auth');
const { check, validationResult } = require('express-validator/check');
const { findById } = require('../../models/Article');

// Preload article objects on routes with ':article'
router.param('article', function(req, res, next, slug) {
  Article.findOne({ slug: slug})
    .populate('author')
    .then(function (article) {
      if (!article) { return res.sendStatus(404); }

      req.article = article;

      return next();
    }).catch(next);
});

router.param('comment', function(req, res, next, id) {
  Comment.findById(id).then(function(comment){
    if(!comment) { return res.sendStatus(404); }

    req.comment = comment;

    return next();
  }).catch(next);
});

router.get('/', auth, function(req, res, next) {
  var query = {};
  var limit = 20;
  var offset = 0;

  if(typeof req.query.limit !== 'undefined'){
    limit = req.query.limit;
  }

  if(typeof req.query.offset !== 'undefined'){
    offset = req.query.offset;
  }

  if( typeof req.query.tag !== 'undefined' ){
    query.tagList = {"$in" : [req.query.tag]};
  }

  Promise.all([
    req.query.author ? User.findOne({username: req.query.author}) : null,
    req.query.favorited ? User.findOne({username: req.query.favorited}) : null
  ]).then(function(results){
    var author = results[0];
    var favoriter = results[1];

    if(author){
      query.author = author._id;
    }

    if(favoriter){
      query._id = {$in: favoriter.favorites};
    } else if(req.query.favorited){
      query._id = {$in: []};
    }

    return Promise.all([
      Article.find(query)
        .limit(Number(limit))
        .skip(Number(offset))
        .sort({createdAt: 'desc'})
        .populate('author')
        .exec(),
      Article.count(query).exec(),
      req.payload ? User.findById(req.payload.id) : null,
    ]).then(function(results){
      var articles = results[0];
      var articlesCount = results[1];
      var user = results[2];

      return res.json({
        articles: articles.map(function(article){
          return article.toJSONFor(user);
        }),
        articlesCount: articlesCount
      });
    });
  }).catch(next);
});

router.get('/feed', auth, function(req, res, next) {
  var limit = 20;
  var offset = 0;

  if(typeof req.query.limit !== 'undefined'){
    limit = req.query.limit;
  }

  if(typeof req.query.offset !== 'undefined'){
    offset = req.query.offset;
  }

  User.findById(req.payload.id).then(function(user){
    if (!user) { return res.sendStatus(401); }

    Promise.all([
      Article.find({ author: {$in: user.following}})
        .limit(Number(limit))
        .skip(Number(offset))
        .populate('author')
        .exec(),
      Article.count({ author: {$in: user.following}})
    ]).then(function(results){
      var articles = results[0];
      var articlesCount = results[1];

      return res.json({
        articles: articles.map(function(article){
          return article.toJSONFor(user);
        }),
        articlesCount: articlesCount
      });
    }).catch(next);
  });
});

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

// return an article's comments
router.get('/comments/:article', [
  auth,
  check('text', 'Enter a comment').not().isEmpty()
], async (req, res) => {

  const text = req.body.text;

  try {
    const article = new Article.findById(req.user.id);

    if(!article) {
      return res.status(404).json({ msg: 'Article not found' });
    }

    const comment = {
      user: req.user.id,
      text: text
    }

    article.comments.unShift(comment);

    await article.save();
  } catch (error) {
    console.error(error);
    return res.status(500).json({ msg: 'Server ' });
  }
  Promise.resolve(req.payload ? User.findById(req.payload.id) : null).then(function(user){
    return req.article.populate({
      path: 'comments',
      populate: {
        path: 'author'
      },
      options: {
        sort: {
          createdAt: 'desc'
        }
      }
    }).execPopulate().then(function(article) {
      return res.json({comments: req.article.comments.map(function(comment){
        return comment.toJSONFor(user);
      })});
    });
  }).catch(next);
});

// create a new comment
router.post('/:article/comments', auth, function(req, res, next) {
  User.findById(req.payload.id).then(function(user){
    if(!user){ return res.sendStatus(401); }

    var comment = new Comment(req.body.comment);
    comment.article = req.article;
    comment.author = user;

    return comment.save().then(function(){
      req.article.comments.push(comment);

      return req.article.save().then(function(article) {
        res.json({comment: comment.toJSONFor(user)});
      });
    });
  }).catch(next);
});

router.delete('/:article/comments/:comment', auth, function(req, res, next) {
  if(req.comment.author.toString() === req.payload.id.toString()){
    req.article.comments.remove(req.comment._id);
    req.article.save()
      .then(Comment.find({_id: req.comment._id}).remove().exec())
      .then(function(){
        res.sendStatus(204);
      });
  } else {
    res.sendStatus(403);
  }
});

module.exports = router;
