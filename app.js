// app.js

var cfenv = require( 'cfenv' );
var crypto = require( 'crypto' );
var express = require( 'express' );
var basicAuth = require( 'basic-auth-connect' );
var bodyParser = require( 'body-parser' );
var fs = require( 'fs' );
var jwt = require( 'jsonwebtoken' );
var multer = require( 'multer' );
var OAuth = require( 'oauth' );
var request = require( 'request' );
var session = require( 'express-session' );
var uuidv1 = require( 'uuid/v1' );
var app = express();

var settings = require( './settings' );
var appEnv = cfenv.getAppEnv();

//. https://www.npmjs.com/package/@cloudant/cloudant
var Cloudantlib = require( '@cloudant/cloudant' );
var cloudant = null;
var db = null;

if( !settings.db_host ){
  cloudant = Cloudantlib( { account: settings.db_username, password: settings.db_password } );
}else{
  var url = settings.db_protocol + '://';
  if( settings.db_username && settings.db_password ){
    url += ( settings.db_username + ':' + settings.db_password + '@' );
  }
  url += ( settings.db_host + ':' + settings.db_port );
  cloudant = Cloudantlib( url );
}

if( cloudant ){
  cloudant.db.get( settings.db_name, function( err, body ){
    if( err ){
      if( err.statusCode == 404 ){
        cloudant.db.create( settings.db_name, function( err, body ){
          if( err ){
            db = null;
          }else{
            db = cloudant.db.use( settings.db_name );
            createDesignDocument();
          }
        });
      }else{
        db = cloudant.db.use( settings.db_name );
        createDesignDocument();
      }
    }else{
      db = cloudant.db.use( settings.db_name );
      createDesignDocument();
    }
  });
}

/*
app.all( '/*', basicAuth( function( user, pass ){
  return ( user && user === pass );
}));
*/

app.use( multer( { dest: './tmp/' } ).single( 'file' ) );
app.set( 'superSecret', settings.superSecret );
app.use( express.static( __dirname + '/public' ) );
app.use( bodyParser.urlencoded( { extended: true, limit: '10mb' } ) );
//app.use( bodyParser.urlencoded() );
app.use( bodyParser.json() );

app.use( session({
  secret: settings.superSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: false,           //. https で使う場合は true
    maxage: 1000 * 60 * 60   //. 60min
  }
}) );

app.set( 'views', __dirname + '/views' );
app.set( 'view engine', 'ejs' );


//. Twitter API
var oa = new OAuth.OAuth(
  "https://api.twitter.com/oauth/request_token",
  "https://api.twitter.com/oauth/access_token",
  settings.twitter_consumer_key,
  settings.twitter_consumer_secret,
  "1.0A",
  null, //"http://127.0.0.1:3000/twitter/callback",
  "HMAC-SHA1"
);

app.get( '/twitter', function( req, res ){
  oa.getOAuthRequestToken( function( err, oauth_token, oauth_token_secret, results ){
    if( err ){
      console.log( err );
      //res.send( "error(1): " + err );
      res.redirect( '/' );
    }else{
      req.session.oauth = {};
      req.session.oauth.token = oauth_token;
      req.session.oauth.token_secret = oauth_token_secret;
      //console.log( 'oauth_token = ' + oauth_token + ', oauth_token_secret = ' + oauth_token_secret );
      res.redirect( 'https://twitter.com/oauth/authenticate?oauth_token=' + oauth_token );
    }
  });
});

app.get( '/twitter/callback', function( req, res, next ){
  if( req.session.oauth ){
    req.session.oauth.verifier = req.query.oauth_verifier;
    var oauth = req.session.oauth;
    oa.getOAuthAccessToken( oauth.token, oauth.token_secret, oauth.verifier, function( err, oauth_access_token, oauth_access_token_secret, results ){
      if( err ){
        console.log( err );
        //res.send( "error(2): " + err );
        res.redirect( '/' );
      }else{
        //req.session.oauth.access_token = oauth_access_token;
        //req.session.oauth.access_token_secret = oauth_access_token_secret;
        //console.log( results );
        req.session.oauth.provider = 'twitter';
        req.session.oauth.user_id = results.user_id;
        req.session.oauth.screen_name = results.screen_name;

        var token = jwt.sign( req.session.oauth, app.get( 'superSecret' ), { expiresIn: '25h' } );
        req.session.token = token;
        //res.send( "Worked." );
        res.redirect( '/' );
      }
    });
  }else{
    //next( new Error( "you are not supposed to be here." ) );
    res.redirect( '/' );
  }
});

app.post( '/logout', function( req, res ){
  req.session.token = null;
  //res.redirect( '/' );
  res.write( JSON.stringify( { status: true }, 2, null ) );
  res.end();
});


app.get( '/', function( req, res ){
  if( req.session && req.session.token ){
    var token = req.session.token;
    jwt.verify( token, app.get( 'superSecret' ), function( err, user ){
      if( !err && user ){
        res.render( 'index', { user: user } );
      }else{
        res.render( 'index', { user: null } );
      }
    });
  }else{
    res.render( 'index', { user: null } );
  }
});

app.get( '/admin', function( req, res ){
  if( req.session && req.session.token ){
    var token = req.session.token;
    jwt.verify( token, app.get( 'superSecret' ), function( err, user ){
      if( !err && user ){
        res.render( 'admin', { user: user } );
      }else{
        res.render( 'admin', { user: null } );
      }
    });
  }else{
    res.render( 'admin', { user: null } );
  }
});

app.get( '/profileimage', function( req, res ){
  var screen_name = req.query.screen_name;
  if( screen_name ){
    var option = {
      url: 'https://twitter.com/' + screen_name + '/profile_image?size=original',
      method: 'GET'
    };
    request( option, ( err0, res0, body0 ) => {
      if( err0 ){
        return res.status( 403 ).send( { status: false, error: err0 } );
      }else{
        res.redirect( 'https://pbs.twimg.com' + res0.request.path );
      }
    });
  }else{
    return res.status( 403 ).send( { status: false, error: 'No screen_name provided.' } );
  }
});


app.post( '/file', function( req, res ){
  res.contentType( 'application/json; charset=utf-8' );
  //console.log( 'POST /file' );
  //console.log( req.body );
  if( db ){
    if( req.body._id ){
      //. 更新
      res.status( 400 );
      res.write( JSON.stringify( { status: false, message: '_id shoud not specified in body.' }, 2, null ) );
      res.end();
    }else{
      //. 作成
      var doc = req.body;
      doc.created = doc.updated = ( new Date() ).getTime();

      if( req.file && req.file.path ){
        var path = req.file.path;
        var type = req.file.mimetype;
        var filename = req.file.originalname;

        var bin = fs.readFileSync( path );
        var bin64 = new Buffer( bin ).toString( 'base64' );

        doc.filename = filename;
        doc['_attachments'] = {
          file: {
            content_type : type,
            data: bin64
          }
        };

        //. tempolary file
        var _doc = {};
        _doc['_attachments'] = {
          file: {
            content_type: type,
            data: bin64
          }
        };
        db.insert( _doc, function( _err, _body ){
          if( req.file && req.file.path ){ fs.unlink( req.file.path, function( e ){} ); }
          if( _err ){
            res.status( 400 );
            res.write( JSON.stringify( { status: false, message: _err }, 2, null ) );
            res.end();
          }else{
            var _id = _body.id;

            //. 添付バイナリを取得する
            db.attachment.get( _id, 'file', function( err, buf ){
              //. remove tempolary file
              db.destroy( _id, _body.rev, function( err, body ){} );

              if( err ){
                res.contentType( 'application/json; charset=utf-8' );
                res.status( 400 );
                res.write( JSON.stringify( { status: false, message: err }, 2, null ) );
                res.end();
              }else{
                //res.end( buf, 'binary' );
                //バイナリのハッシュ値を求める
                var hash = crypto.createHash( 'sha512' );
                hash.update( buf );
                doc._id = hash.digest( 'hex' );

                db.insert( doc, function( err, body ){
                  if( err ){
                    console.log( err );
                    res.status( 400 );
                    res.write( JSON.stringify( { status: false, message: err }, 2, null ) );
                    res.end();
                  }else{
                    res.write( JSON.stringify( { status: true, doc: body, message: 'file created.' }, 2, null ) );
                    res.end();

                    //. hashchainsolo
                    //. 添付ファイルを含んだまま POST するとエラー（PayloadTooLargeError: request entity too large）
                    //. 理論上は添付ファイルを Hashchain Solo に格納することは可能だが、今回はハッシュ値のみにする
                    if( settings.hashchainsolo_url ){
                      delete doc._attachments.file;

                      var option = {
                        url: settings.hashchainsolo_url + '/doc',
                        method: 'POST',
                        json: {
                          _id: doc._id,
                          method: 'POST',
                          path: '/doc',
                          body: doc,
                          result: body
                        }
                      };

                      if( doc.user_id ){
                        option.headers = { 'x-hashchainsolo-key': doc.user_id };
                      }

                      request( option, ( err0, res0, body0 ) => {
                        if( err0 ){
                          console.log( err0 );
                        }else{
                          console.log( body0 );
                        }
                      });
                    }
                  }
                });
              }
            });
          }
        });
      }else{
        //. 添付なし
        res.status( 400 );
        res.write( JSON.stringify( { status: false, message: 'no file attached.' }, 2, null ) );
        res.end();
      }
    }
  }else{
    res.status( 400 );
    res.write( JSON.stringify( { status: false, message: 'db is failed to be initialized.' }, 2, null ) );
    res.end();
  }
});

app.get( '/file/:id', function( req, res ){
  res.contentType( 'application/json; charset=utf-8' );
  var id = req.params.id;
  //console.log( 'GET /file/' + id );
  if( db ){
    db.get( id, { include_docs: true }, function( err, body ){
      if( err ){
        res.status( 400 );
        res.write( JSON.stringify( { status: false, message: err }, 2, null ) );
        res.end();
      }else{
        res.write( JSON.stringify( { status: true, file: body }, 2, null ) );
        res.end();
      }
    });
  }else{
    res.status( 400 );
    res.write( JSON.stringify( { status: false, message: 'db is failed to be initialized.' }, 2, null ) );
    res.end();
  }
});

app.get( '/file/:id/attachment', function( req, res ){
  res.contentType( 'application/json; charset=utf-8' );
  var id = req.params.id;
  //console.log( 'GET /file/' + id + '/attachment' );
  if( db ){
    db.get( id, { include_docs: true }, function( err, body ){
      if( err ){
        res.status( 400 );
        res.write( JSON.stringify( { status: false, message: err }, 2, null ) );
        res.end();
      }else{
        if( body._attachments ){
          for( key in body._attachments ){
            var attachment = body._attachments[key];
            if( attachment.content_type ){
              res.contentType( attachment.content_type );
            }

            //. 添付バイナリを取得する
            db.attachment.get( id, key, function( err, buf ){
              if( err ){
                res.contentType( 'application/json; charset=utf-8' );
                res.status( 400 );
                res.write( JSON.stringify( { status: false, message: err }, 2, null ) );
                res.end();
              }else{
                res.end( buf, 'binary' );
              }
            });
          }
        }else{
          res.status( 400 );
          res.write( JSON.stringify( { status: false, message: 'No attachment found.' }, 2, null ) );
          res.end();
        }
      }
    });
  }else{
    res.status( 400 );
    res.write( JSON.stringify( { status: false, message: 'db is failed to be initialized.' }, 2, null ) );
    res.end();
  }
});

app.get( '/file/:id/validate', function( req, res ){
  res.contentType( 'application/json; charset=utf-8' );
  var id = req.params.id;
  //console.log( 'GET /file/' + id + '/validate' );
  if( db ){
    db.get( id, { include_docs: true }, function( err, body ){
      if( err ){
        res.status( 400 );
        res.write( JSON.stringify( { status: false, message: err }, 2, null ) );
        res.end();
      }else{
        if( body._attachments ){
          for( key in body._attachments ){
            //var attachment = body._attachments[key];

            //. 添付バイナリを取得する
            db.attachment.get( id, key, function( err, buf ){
              if( err ){
                res.status( 400 );
                res.write( JSON.stringify( { status: false, message: err }, 2, null ) );
                res.end();
              }else{
                //バイナリのハッシュ値を求める
                var hash = crypto.createHash( 'sha512' );
                hash.update( buf );
                var _id = hash.digest( 'hex' );
                if( id == _id ){
                  //. 必要であれば hashchainsolo 側に存在していることも確認する
                  if( settings.hashchainsolo_url ){
                    //. hashchainsolo
                    var option = {
                      url: settings.hashchainsolo_url + '/doc/' + id,
                      method: 'GET'
                    };
                    request( option, ( err0, res0, body0 ) => {
                      if( err0 ){
                        res.status( 400 );
                        res.write( JSON.stringify( { status: false, message: 'found in gf, but not validated with hashchainsolo.' }, 2, null ) );
                        res.end();
                      }else{
                        res.write( JSON.stringify( { status: true, message: 'validated with hashchainsolo.' }, 2, null ) );
                        res.end();
                      }
                    });
                  }else{
                    res.write( JSON.stringify( { status: true }, 2, null ) );
                    res.end();
                  }
                }else{
                  res.status( 400 );
                  res.write( JSON.stringify( { status: false, message: 'hash not matched.' }, 2, null ) );
                  res.end();
                }
              }
            });
          }
        }else{
          res.status( 400 );
          res.write( JSON.stringify( { status: false, message: 'No attachment found.' }, 2, null ) );
          res.end();
        }
      }
    });
  }else{
    res.status( 400 );
    res.write( JSON.stringify( { status: false, message: 'db is failed to be initialized.' }, 2, null ) );
    res.end();
  }
});

app.delete( '/file/:id', function( req, res ){
  res.contentType( 'application/json; charset=utf-8' );
  var id = req.params.id;
  var user_id = req.body.user_id;
  //console.log( 'DELETE /file/' + id );
  if( db ){
    if( user_id ){
      db.get( id, function( err, data ){
        if( err ){
          res.status( 400 );
          res.write( JSON.stringify( { status: false, message: err }, 2, null ) );
          res.end();
        }else{
          //console.log( data );
          if( user_id == data.user_id ){
            db.destroy( id, data._rev, function( err, body ){
              if( err ){
                res.status( 400 );
                res.write( JSON.stringify( { status: false, message: err }, 2, null ) );
                res.end();
              }else{
                res.write( JSON.stringify( { status: true }, 2, null ) );
                res.end();

                if( settings.hashchainsolo_url ){
                  //. hashchainsolo
                  var option = {
                    url: settings.hashchainsolo_url + '/doc',
                    method: 'POST',
                    json: {
                      method: 'DELETE',
                      path: '/file/' + id,
                      body: { user_id: user_id },
                      result: body
                    }
                  };
                  request( option, ( err0, res0, body0 ) => {
                    if( err0 ){
                      console.log( err0 );
                    }else{
                      console.log( body0 );
                    }
                  });
                }
              }
            });
          }else{
            res.status( 400 );
            res.write( JSON.stringify( { status: false, message: 'no permission' }, 2, null ) );
            res.end();
          }
        }
      });
    }else{
      res.status( 400 );
      res.write( JSON.stringify( { status: false, message: 'no user_id specified.' }, 2, null ) );
      res.end();
    }
  }else{
    res.status( 400 );
    res.write( JSON.stringify( { status: false, message: 'db is failed to be initialized.' }, 2, null ) );
    res.end();
  }
});


/*
 You need to create search index 'design/search' with name 'newSearch' in your Cloudant DB before executing this API.
 */
app.get( '/search', function( req, res ){
  res.contentType( 'application/json; charset=utf-8' );
  //console.log( 'GET /search' );
  if( db ){
    var q = req.query.q;
    if( q ){
      db.search( 'library', 'newSearch', { q: q, include_docs: true }, function( err, body ){
        if( err ){
          res.status( 400 );
          res.write( JSON.stringify( { status: false, message: err }, 2, null ) );
          res.end();
        }else{
          res.write( JSON.stringify( { status: true, result: body }, 2, null ) );
          res.end();
        }
      });
    }else{
      res.status( 400 );
      res.write( JSON.stringify( { status: false, message: 'parameter: q is required.' }, 2, null ) );
      res.end();
    }
  }else{
    res.status( 400 );
    res.write( JSON.stringify( { status: false, message: 'db is failed to be initialized.' }, 2, null ) );
    res.end();
  }
});

app.get( '/query', function( req, res ){
  res.contentType( 'application/json; charset=utf-8' );
  var user_id = req.query.user_id ? req.query.user_id : '';
  var limit = req.query.limit ? parseInt( req.query.limit ) : 0;
  var offset = req.query.offset ? parseInt( req.query.offset ) : 0;
  //console.log( 'GET /query?user_id=' + user_id + '&limit=' + limit + '&offset=' + offset );

  if( db ){
    if( user_id ){
      var option = { selector: { user_id: user_id } };
      if( limit ){ option['limit'] = limit; }
      if( offset ){ option['skip'] = offset; }
      db.find( option, function( err, body ){
        if( err ){
          res.status( 400 );
          res.write( JSON.stringify( { status: false, message: err }, 2, null ) );
          res.end();
        }else{
          var docs = [];
          body.docs.forEach( function( doc ){
            if( doc._id.indexOf( '_' ) !== 0 ){
              docs.push( doc );
            }
          });

          var result = { status: true, docs: docs };
          res.write( JSON.stringify( result, 2, null ) );
          res.end();
        }
      });
    }else{
      res.status( 400 );
      res.write( JSON.stringify( { status: false, message: 'parameter: user_id is required.' }, 2, null ) );
      res.end();
    }
  }else{
    res.status( 400 );
    res.write( JSON.stringify( { status: false, message: 'db is failed to initialize.' }, 2, null ) );
    res.end();
  }
});


app.post( '/reset', function( req, res ){
  res.contentType( 'application/json; charset=utf-8' );
  //console.log( 'POST /reset' );
  if( db ){
    var passphrase = req.headers['x-passphrase'];
    if( settings.enablereset && passphrase == settings.db_name ){
      db.list( {}, function( err, body ){
        if( err ){
          res.status( 400 );
          res.write( JSON.stringify( { status: false, message: err }, 2, null ) );
          res.end();
        }else{
          var docs = [];
          body.rows.forEach( function( doc ){
            var _id = doc.id;
            if( _id.indexOf( '_' ) !== 0 ){
              var _rev = doc.value.rev;
              docs.push( { _id: _id, _rev: _rev, _deleted: true } );
            }
          });

          if( docs.length > 0 ){
            db.bulk( { docs: docs }, function( err ){
              res.write( JSON.stringify( { status: true, message: docs.length + ' files are deleted.' }, 2, null ) );
              res.end();
            });

            if( settings.hashchainsolo_url && settings.hashchainsolo_db_name ){
              //. hashchainsolo もリセット
              var option = {
                headers: { 'x-passphrase': settings.hashchainsolo_db_name },
                url: settings.hashchainsolo_url + '/reset',
                method: 'POST'
              };
              request( option, ( err0, res0, body0 ) => {
                if( err0 ){
                  console.log( err0 );
                }else{
                  console.log( body0 );
                }
              });
            }
          }else{
            res.write( JSON.stringify( { status: true, message: 'No files need to be deleted.' }, 2, null ) );
            res.end();
          }
        }
      });
    }else{
      res.status( 400 );
      res.write( JSON.stringify( { status: false, message: 'reset is not enabled. Change exports.resetenabled = true in settings.js' }, 2, null ) );
      res.end();
    }
  }else{
    res.status( 400 );
    res.write( JSON.stringify( { status: false, message: 'db is failed to be initialized.' }, 2, null ) );
    res.end();
  }
});

app.get( '/dbinfo', function( req, res ){
  res.contentType( 'application/json; charset=utf-8' );
  //console.log( 'GET /dbinfo' );
  if( db ){
    db.info( function( err, body ){
      if( err ){
        res.status( 400 );
        res.write( JSON.stringify( { status: false, message: err }, 2, null ) );
        res.end();
      }else{
        if( body.update_seq ){
          delete body.update_seq;
        }
        res.write( JSON.stringify( { status: true, info: body }, 2, null ) );
        res.end();
      }
    });
  }else{
    res.status( 400 );
    res.write( JSON.stringify( { status: false, message: 'db is failed to be initialized.' }, 2, null ) );
    res.end();
  }
});

app.post( '/decrypt', function( req, res ){
  res.contentType( 'application/json; charset=utf-8' );
  //console.log( 'POST /decrypt' );
  //console.log( req.body );
  if( req.body && req.body.body && req.body.key ){
    var key = req.body.key;
    var body = req.body.body;

    jwt.verify( body, key, function( err, decrypted ){
      if( err ){
        res.status( 400 );
        res.write( JSON.stringify( { status: false, message: err }, 2, null ) );
        res.end();
      }else{
        res.write( JSON.stringify( { status: true, body: decrypted }, 2, null ) );
        res.end();
      }
    });
  }else{
    res.status( 400 );
    res.write( JSON.stringify( { status: false, message: 'no body/key found in request body.' }, 2, null ) );
    res.end();
  }
});

app.get( '/test', function( req, res ){
  res.contentType( 'application/json; charset=utf-8' );
  //console.log( 'GET /test' );

  if( db ){
    res.write( JSON.stringify( { status: true }, 2, null ) );
    res.end();
  }else{
    res.status( 400 );
    res.write( JSON.stringify( { status: false, message: 'db is failed to be initialized.' }, 2, null ) );
    res.end();
  }
});


function sortDocuments( _docs, key ){
  var docs = [];
  if( !key ){ key = 'created'; }
  for( var i = 0; i < _docs.length; i ++ ){
    var _doc = _docs[i];
    if( key in _doc ){
      var b = false;
      for( var j = 0; j < docs.length && !b; j ++ ){
        if( docs[j][key] > _doc[key] ){
          docs.splice( j, 0, _doc );
          b = true;
        }
      }
      if( !b ){
        docs.push( _doc );
      }
    }
  }

  return docs;
}

function createDesignDocument(){
  var search_index_function = 'function (doc) { index( "default", doc._id ); }';
  if( settings.search_fields ){
    search_index_function = 'function (doc) { index( "default", ' + settings.search_fields + '.join( " " ) ); }';
  }

  //. デザインドキュメント作成
  var design_doc_doc = {
    _id: "_design/library",
    language: "javascript",
    views: {
      bycreated: {
        map: "function (doc) { if( doc.created ){ emit(doc.created, doc); } }"
      },
      byupdated: {
        map: "function (doc) { if( doc.updated ){ emit(doc.updated, doc); } }"
      }
    },
    indexes: {
      newSearch: {
        "analyzer": settings.search_analyzer,
        "index": search_index_function
      }
    }
  };
  db.insert( design_doc_doc, function( err, body ){
    if( err ){
      //console.log( "db init(1): err" );
      //console.log( err );
    }else{
      console.log( "db init(1): " );
      console.log( body );

      //. クエリーインデックス作成
      var query_index_user_id = {
        _id: "_design/user_id-index",
        language: "query",
        views: {
          "user_id-index": {
            map: {
              fields: { "user_id": "asc" },
              partial_filter_selector: {}
            },
            reduce: "_count",
            options: {
              def: {
                fields: [ "user_id" ]
              }
            }
          }
        }
      };
      db.insert( query_index_user_id, function( err, body ){
        if( err ){
          //console.log( "db init(2): err" );
          //console.log( err );
        }else{
          console.log( "db init(2): " );
          console.log( body );
        }
      });
    }
  });
}


var port = settings.app_port || appEnv.port || 3000;
app.listen( port );
console.log( 'server started on ' + port );
