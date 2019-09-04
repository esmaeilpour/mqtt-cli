## An handy client for interacting with mqtt server from your command line

Once we were working on a messaging platform called [Gap.im](https://gap.im) we needed an handy tool to comunicate with the message-broker cause it was hard to test whether the broker works properly in the client side.

With this tool you are able to connect to any mqtt server even with multiple connections afterward it will be easy to publish messages in a topic or subscribe on it.


#### Features
- Supports multiple connections
- Initializes with configurable connections
- Commands history
- Ease of use

### How to install

```
$ git clone https://github.com/esmaeilpour/mqtt-cli
$ cd mqtt-cli
$ npm i
```
### Configuretion
There is a `connections.json` file in the root directory what can be used as an intialized configurations.

Open the file and add easily your connections into it.

### How to use
Simply start application with following command
```
$ node index.js
mqtt$ help

  Commands:

    help [command...]          Provides help for a given command.
    exit                       Exits application.
    connect [options]          Connect to mqtt.
    ls                         List of available connections.
    use [number]               Use a mqtt connections.
    silent [options] [number]  Silent a mqtt connections.
    pub [options]              Publish message to mqtt.
    sub [options]              Subscribe topic.
    unsub [options]            Unsubscribe topic.
    save                       Save current connection.
    kill [number]              Kill a mqtt connections.
    restart                    Restart.
```

After you add mqtt connections by either command line or configured file you can easily publish a message in a topic

```
mqtt$ pub -t echo -p foo
```

or subscribe/unsubscribe on a topic. as long as you subscribe on a topic you will receive any message which published on the topic with this/other clients

```
mqtt$ sub -t echo
1> delivered to guest2/654321 echo foo
mqtt$ unsub -t echo
```

Notice: Each connections has a sequential interger id which you can use as connection id in some commands like `silent`, `kill` etc.

Sometimes when you have multiple connections then you will receive a lot messages so you can silent a connections by silent command

```
mqtt$ silent 3
```

And finaly you can kill a connection with following command
```
mqtt$ kill 0
```


### Thanks
- [Vorpal](https://github.com/dthree/vorpal)