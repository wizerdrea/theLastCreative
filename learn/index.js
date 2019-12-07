var app = require('express')();
var http = require('http').createServer(app);
var io = require('socket.io')(http);

/* static file serving */
app.get('/', function(req, res){
  res.sendFile(__dirname + '/public/' + 'index.html');
});

//adds file name to req
app.param('fileName', function(req, res, next, fileName) {
    req.fileName = fileName;
    return next();
});

app.get('/:fileName', function(req, res){
  res.sendFile(__dirname + '/public/' + req.fileName);
});

/* end of static files */

io.on('connection', function(socket){
  console.log('a user connected');
  console.log(socket.id);
  socket.on('disconnect', function(){
    console.log('user disconnected');
    console.log(socket.id); 
  });
});



io.on('connection', function(socket){
  socket.on('chat message', function(msg){
    socket.broadcast.emit('chat message', msg);
  });
});

http.listen(8082, function(){
  console.log('listening on *:8082');
});