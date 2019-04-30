exports.db_username = '';
exports.db_password = '';
exports.db_name = 'gfdb';
exports.db_host = '';
exports.db_url = '';
exports.db_protocol = 'http';
exports.db_port = 5984;
exports.app_port = 0;
exports.hashchainsolo_url = '';
exports.hashchainsolo_db_name = '';
exports.enablereset = true;
exports.superSecret = 'genuinefiles';
exports.search_analyzer = 'japanese';
exports.search_fields = '[doc.body.user_id]';
exports.twitter_consumer_key = '';
exports.twitter_consumer_secret = '';

if( process.env.VCAP_SERVICES ){
  var VCAP_SERVICES = JSON.parse( process.env.VCAP_SERVICES );
  if( VCAP_SERVICES && VCAP_SERVICES.cloudantNoSQLDB ){
    exports.db_username = VCAP_SERVICES.cloudantNoSQLDB[0].credentials.username;
    exports.db_password = VCAP_SERVICES.cloudantNoSQLDB[0].credentials.password;
    exports.db_host = VCAP_SERVICES.cloudantNoSQLDB[0].credentials.host;
    exports.db_url = VCAP_SERVICES.cloudantNoSQLDB[0].credentials.url;
    exports.db_port = VCAP_SERVICES.cloudantNoSQLDB[0].credentials.port;
    exports.db_protocol = 'https';
  }
}

if( !exports.db_url && exports.db_username && exports.db_password ){
  if( !exports.db_host ){
    exports.db_host = exports.db_username + '.cloudant.com';
    exports.db_port = 443;
    exports.db_protocol = 'https';
  }
  exports.db_url = exports.db_protocol + '://' + exports.db_username + ':' + exports.db_password
      + '@' + exports.db_host;
  if( exports.db_port ){
    exports.db_url += ( ':' + exports.db_port );
  }
}
