var mongoose = require('mongoose');
var uniqueValidator = require('mongoose-unique-validator');
var slug = require('slug');
var User = require('./User');

var ArticleSchema = new mongoose.Schema({
  slug: {
    type: String, 
    lowercase: true, 
    unique: true
  },
  title: {
    type: String, 
    required: true, 
  },
  description: {
    type: String, 
    required: true, 
  },
  body: {
    type: String, 
    required: true, 
  },
  // Likes is an array of objects of user's ids that 
  // have decided to like the article
  likes: [
    {
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    }
  ],
  comments: [
    {
      user: {
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Comment' 
      },

      text: {
        type: String,
        required: true
      },

      date: {
        type: Date,
        default: Date.now
      }

    }
  ],
  tagList: [
    {
      type: String 
    }
  ],
  author: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User' 
  }
}, {timestamps: true});

ArticleSchema.plugin(uniqueValidator, {message: 'is already taken'});

ArticleSchema.pre('validate', function(next){
  if(!this.slug)  {
    this.slugify();
  }

  next();
});

ArticleSchema.methods.slugify = function() {
  this.slug = slug(this.title) + '-' + (Math.random() * Math.pow(36, 6) | 0).toString(36);
};

ArticleSchema.methods.updateFavoriteCount = function() {
  var article = this;

  return User.count({favorites: {$in: [article._id]}}).then(function(count){
    article.favoritesCount = count;

    return article.save();
  });
};

ArticleSchema.methods.toJSONFor = function(user){
  return {
    slug: this.slug,
    title: this.title,
    description: this.description,
    body: this.body,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
    tagList: this.tagList,
    favorited: user ? user.isFavorite(this._id) : false,
    favoritesCount: this.favoritesCount,
    author: this.author.toProfileJSONFor(user)
  };
};

module.exports = Article = mongoose.model('Article', ArticleSchema);
