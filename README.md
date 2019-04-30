# gf(genuine files)

## Overview


## Pre-requisite before install

- IBM Cloud account

    - You can choose **Lite Account**, which is limited-use(but pay-free) account.

        - https://www.ibm.com/cloud-computing/jp/ja/bluemix/lite-account/

- IBM Cloudant service instance in IBM Cloud

    - You can also choose **Lite Plan** in IBM Cloud, which is also limited-use(but pay-free) plan.

        - https://console.bluemix.net/catalog/services/cloudant-nosql-db

- Twitter API consumer_key and twitter_consumer_secret

    - You need to create your application, and get consumer_key and consumer_secret.

        - https://apps.twitter.com/

- Node.js and npm need to be installed in operating system.


## Install & Setup

- Login to IBM Cloud, and create IBM Cloudant service instance.

- Check your service credential(username and password) of IBM Cloudant

- Setup [Hashchain Solo](https://gitlab.com/dotnsf/hashchainsolo)

- Git clone/download source files:

    - https://github.com/dotnsf/gf

- Edit settings.js with you IBM Cloudant username and password, **exports.hashchainsolo_url**, **exports.hashchainsolo_db_name**, and Twitter API consumer_key and consumer_secret.

- Enable CORS for you IBM Cloudant. CORS needs to be configured as accepting from all domains, for your Les Amis's application server domains.

- (Optional)Edit **exports.app_port** value in settings.js to change application listening port(default 0, which means dynamic assignment).

- (Optional)Edit **exports.search_analyzer** value and **exports.search_fields** value in settings.js to change search behavior.

- Install dependencies:

    - `$ npm install`

- Run

    - `$ node app`


## References

- CouchDB(Cloudant) HTTP API Reference

    - http://docs.couchdb.org/en/2.1.1/http-api.html

- Cloudant(npm) API Reference

    - https://www.npmjs.com/package/@cloudant/cloudant#api-reference


## Licensing

This code is licensed under MIT.

https://github.com/dotnsf/gf/blob/master/LICENSE


## Special Thanks


## Copyright

2019 [K.Kimura @ Juge.Me](https://github.com/dotnsf) all rights reserved.
