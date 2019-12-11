var app = require('express')();
var http = require('http').createServer(app);
var io = require('socket.io')(http);
const mongoose = require('mongoose');



/****** set up mongoose database ******/
mongoose.connect('mongodb://localhost:27017/game2', { useNewUrlParser: true, useUnifiedTopology: true });

// Create a scheme for current users connected to webpage
const userSchema = new mongoose.Schema({
  game: String,
  socketID: String,
});

const user = mongoose.model('users', userSchema);

//creat a model for a game
const gameSchema = new mongoose.Schema({
  player1: Object,
  player2: { type: Object, default: {} },
  started: { type: Boolean, default: false },
  gameOver: { type: Boolean, default: false },
  winner: { type: String, default: "none" },
  log: Array,
  currentPlayer: String,
});

const game = mongoose.model('games', gameSchema);

//create a model for characters
const characterSchema = new mongoose.Schema({
  name: String,
  maxHP: { type: Number, default: 75 },
  maxMP: { type: Number, default: 50 },
  hp: { type: Number, default: 75 },
  mp: { type: Number, default: 75 },
  attacks: Array,
  playerID: String,
});

const character = mongoose.model('characters', characterSchema);

//create a model for attacks
const attackSchema = new mongoose.Schema({
  title: String,
  level: { type: Number, default: 1 },
  mpCost: { type: Number, default: 7 },
  hpCost: { type: Number, default: 0 },
  cooldown: { type: Number, default: 1 },
  turnsUntilReady: { type: Number, default: 0 },
  strength: { type: Number, default: 10 },
  targetOpponent: { type: Boolean, default: true },
  targetSelf: { type: Boolean, default: false },
  damageOpponent: { type: Boolean, default: true },
  damageSelf: { type: Boolean, default: false },
  description: String,
  index: { type: Number, default: 1 },
  findable: { type: Boolean, default: true }
});

const attack = mongoose.model('attacks', attackSchema);

//create schemes for getting names and adjectives
const nameSchema = new mongoose.Schema({
  name: String,
});

const name = mongoose.model('names', nameSchema);


const adjectiveSchema = new mongoose.Schema({
  adjective: String,
});

const adjective = mongoose.model('adjectives', adjectiveSchema);


/****** end of mongoose setup ******/



/****** static file serving ******/
app.get('/', function(req, res) {
  res.sendFile(__dirname + '/public/' + 'index.html');
});

//adds file name to req
app.param('fileName', function(req, res, next, fileName) {
  req.fileName = fileName;
  return next();
});

app.get('/:fileName', function(req, res) {
  res.sendFile(__dirname + '/public/' + req.fileName);
});
/****** end of static files ******/




/****** handle connects and disconnects ******/
io.on('connection', function(socket) {
  //add user to current user database
  const newUser = new user({
    game: "none",
    socketID: socket.id
  });
  newUser.save();
  socket.on('disconnect', async function() {
    try {
      //remove user from current user database
      let disconnectingUser = await user.findOne({ socketID: socket.id });
      await user.deleteOne({ socketID: socket.id }, function(err) {
        if (err) console.log("problem");
      });
      if (disconnectingUser.game !== "none") {
        io.to(disconnectingUser.game).emit('quit');
        //io.sockets.clients(disconnectingUser.game).forEach(function(s){ s.leave(disconnectingUser.game); });
        await game.deleteOne({ _id: disconnectingUser.game });
      }
    }
    catch (error) {
      console.log("something's wrong");
      console.log(error);
    }
  });
});
/****** end of connects and disconnects ******/



/****** perform actions ******/
io.on('connection', function(socket) {
  socket.on('chat message', function(msg) {
    console.log("message: " + msg);
    socket.broadcast.emit('chat message', msg);
  });
  socket.on('newGame', async function() {
    try {
      //generate character
      let newChraracter = await generateCharacter(socket.id);
      let gameID = 0;
      let newGame = {};
      //check if there is a ready game
      if (await game.countDocuments({ started: false })) {
        newGame = await game.findOne({ started: false });
        newGame.player2 = newChraracter;
        newGame.started = true;
        newGame.save();
        gameID = newGame._id;
      }
      else {
        newGame = new game({
          player1: newChraracter,
          log: [],
          currentPlayer: socket.id
        });
        newGame.save();
        gameID = newGame._id;
      }
      socket.join(gameID);
      io.to(gameID).emit('chat message', 'in room ' + gameID);
      let userUpdate = await user.findOne({ socketID: socket.id });
      userUpdate.game = gameID;
      userUpdate.save();
      io.to(gameID).emit('update game', newGame);
    } catch (error) {
      console.log("bummer error making or joinging game (or making character)");
      console.log(error);
    }
  });
  socket.on('attack', async function(index) {
    try {
      await performMove(socket.id, index);
    }
    catch (error) {
      console.log("huh...");
      console.log(error);
    }
  });
  socket.on('quit', async function() {
    try {
      let userUpdate = await user.findOne({ socketID: socket.id });
      let gameID = userUpdate.game;
      let updatedGame = await game.findOne({ _id: gameID });
      let player1 = await user.findOne({ socketID: updatedGame.player1.playerID });
      player1.game = "none";
      let player2 = await user.findOne({ socketID: updatedGame.player2.playerID });
      player2.game = "none";
      io.to(gameID).emit('quit');
      //io.sockets.clients(gameID).forEach(function(s) { s.leave(gameID); });
      await game.deleteOne({ _id: gameID });
    }
    catch (error) {
      console.log("error while quitting");
      console.log(error);
    }
  });
});
/****** end of actions ******/



/****** liston on port ******/
http.listen(8082, function() {
  console.log('listening on *:8082');
});

/****** perform attacks and check if game is over ******/
const performMove = async(playerID, moveIndex) => {
  try {
    //find game 
    const player = await user.findOne({ socketID: playerID });
    const updatedGame = await game.findOne({ _id: player.game });
    let character;
    let opponent;
    if (playerID == updatedGame.player1.playerID) {
      character = updatedGame.player1;
      opponent = updatedGame.player2;
    }
    else {
      character = updatedGame.player2;
      opponent = updatedGame.player1;
    }
    let attack = character.attacks[moveIndex];

    let hpCost = attack.hpCost;
    let mpCost = attack.mpCost;
    let strength = attack.strength + Math.floor((Math.random() * 7)) - 3;
    let title = attack.title;

    //check if attack is valid
    if (attack.turnsUntilReady || (character.hp < hpCost) ||
      (character.mp < mpCost || (playerID != updatedGame.currentPlayer))) {
      return false;
    }

    //update log
    if (hpCost && mpCost) {
      updatedGame.log.unshift(character.name + " has paid " + mpCost + " mp and " + hpCost + " hp to perform " + title);
    }
    else if (mpCost) {
      updatedGame.log.unshift(character.name + " has paid " + mpCost + " mp to perform " + title);
    }
    else if (hpCost) {
      updatedGame.log.unshift(character.name + " has paid " + hpCost + " hp to perform " + title);
    }
    else {
      updatedGame.log.unshift(character.name + " performs " + title);
    }

    //spend hp and mp
    character.hp -= hpCost;
    character.mp -= mpCost;

    //check if targets opponent
    if (attack.targetOpponent) {
      //check if damages opponent
      if (attack.damageOpponent) {
        opponent.hp -= strength;
        updatedGame.log.unshift(opponent.name + " takes " + strength + " damage");
        if (opponent.hp < 0) {
          opponent.hp = 0;
        }
      }
      //else heal opponent
      else {
        updatedGame.players[opponent].hp += strength;
        updatedGame.log.unshift(opponent.name + " gains " + strength + " hp");
        if (opponent.hp > opponent.maxHP) {
          opponent.hp = opponent.maxHP;
        }
      }
    }

    //check if move tagets self
    if (attack.targetSelf) {
      //check if damages self
      if (attack.damageSelf) {
        character.hp -= strength;
        updatedGame.log.unshift(character.name + " takes " + strength + " damage");
        if (character.hp < 0) {
          character.hp = 0;
        }
      }
      //else heal self
      else {
        character.hp += strength;
        updatedGame.log.unshift(character.name + " gains " + strength + " hp");
        if (character.hp > character.maxHP) {
          character.hp = character.maxHP;
        }
      }
    }

    //update move cooldowns
    attack.turnsUntilReady = attack.cooldown;
    for (let i = 0; i < character.attacks.length; ++i) {
      if ((i != moveIndex) && (character.attacks[i].turnsUntilReady)) {
        character.attacks[i].turnsUntilReady--;
      }
    }

    //save information back into game db
    character.attacks[moveIndex] = JSON.parse(JSON.stringify(attack));
    if (playerID == updatedGame.player1.playerID) {
      updatedGame.player1 = JSON.parse(JSON.stringify(character));
      updatedGame.player2 = JSON.parse(JSON.stringify(opponent));
      updatedGame.currentPlayer = updatedGame.player2.playerID;
    }
    else {
      updatedGame.player2 = JSON.parse(JSON.stringify(character));
      updatedGame.player1 = JSON.parse(JSON.stringify(opponent));
      updatedGame.currentPlayer = updatedGame.player1.playerID;
    }

    await game.replaceOne({ _id: updatedGame._id }, updatedGame);


    //check if game is over
    await checkGameOver(updatedGame);

    io.to(updatedGame._id).emit('update game', updatedGame);
    return true;
  }
  catch (error) {
    console.log("making attack error");
    console.log(error);
    return false;
  }
};

//checks if game is over and updates game
const checkGameOver = async(game) => {
  if ((game.player1.hp <= 0) &&
    (game.player2.hp <= 0)) {
    game.gameOver = true;
    game.winner = "none";
    game.log.unshift(game.player1.name + " and " + game.player2.name + " have died.");
    game.log.unshift("The Game is a draw");
    await game.save();
  }
  else if (game.player1.hp <= 0) {
    game.gameOver = true;
    game.winner = game.player2.playerID;
    game.log.unshift(game.player1.name + " has died.");
    game.log.unshift(game.player2.name + " wins!!");
    await game.save();
  }
  else if (game.player2.hp <= 0) {
    game.gameOver = true;
    game.winner = game.player1.playerID;
    game.log.unshift(game.player2.name + " has died.");
    game.log.unshift(game.player1.name + " wins!!");
    await game.save();
  }
};



/****** generating characters ******/
const generateName = async() => {
  let numAdj = await adjective.countDocuments();
  let randAdj = Math.floor(Math.random() * numAdj);
  let adj = (await adjective.findOne().skip(randAdj)).adjective;
  let numNames = await name.countDocuments();
  let randName = Math.floor(Math.random() * numNames);
  let firstName = (await name.findOne().skip(randName)).name;
  let characterName = firstName + " the " + adj;
  return characterName;
};

const generateMove = async(index, level) => {
  //get a random attack
  let numAttacks = await attack.countDocuments({ findable: true });
  let randAttack = Math.floor(Math.random() * numAttacks);
  let newAttack = await attack.findOne({ findable: true }).skip(randAttack);
  //set index to given index
  newAttack.index = index;
  //check if it is a special
  if (newAttack.title != "Special") {
    //if it is not start working in random adjusts
    //set move level
    newAttack.level = level;
    //check if move has mp cost
    if (newAttack.mpCost) {
      newAttack.mpCost += Math.floor((Math.random() * 5)) - 2;
      newAttack.mpCost *= level;
    }
    //check if it has an hp cost
    if (newAttack.hpCost) {
      //add random adjust to hpCost and set cost by level
      newAttack.hpCost += Math.floor((Math.random() * 5)) - 2;
      newAttack.hpCost *= level;
    }
    //add random adjust to cooldown time
    newAttack.cooldown += level + Math.floor((Math.random() * 3)) - 2;
    //set starting turns until ready
    newAttack.turnsUntilReady = newAttack.cooldown;
    //add random adjust to strength
    newAttack.strength += Math.floor((Math.random() * 5)) - 2;
    //set strength by level
    newAttack.strength *= level;
  }
  else {
    //don't forget to set spectial name
    //newAttack.title = generateSpecialAttackTitle();
    //set special level
    newAttack.level = level + Math.floor(Math.random() * 2);
    //set costs
    newAttack.mpCost += Math.floor(Math.random() * newAttack.level * 13);
    newAttack.hpCost += Math.floor(Math.random() * newAttack.level * 7);
    //add random adjust to cooldown time
    newAttack.cooldown += newAttack.Level + Math.floor(Math.random() * newAttack.level * 2);
    //set starting turns until ready
    newAttack.turnsUntilReady = newAttack.cooldown;
    //add random adjust to strength
    newAttack.strength += Math.floor((Math.random() * newAttack.level * 10)) + 5 * newAttack.level;
  }

  return newAttack;
};

const generateCharacter = async(playerID) => {
  let characterName = await generateName();
  let basicAttack = await attack.findOne({ title: "basic attack" });
  basicAttack.strength += Math.floor((Math.random() * 5)) - 2;
  let newCharacter = new character({
    name: characterName,
    attacks: [basicAttack],
    playerID: playerID
  });
  newCharacter.maxHP += Math.floor((Math.random() * 31)) - 15;
  newCharacter.maxMP += Math.floor((Math.random() * 21)) - 10;
  newCharacter.hp = newCharacter.maxHP;
  newCharacter.mp = newCharacter.maxMP;
  newCharacter.attacks.push(await generateMove(1, 1));
  newCharacter.attacks.push(await generateMove(2, 2));
  return newCharacter;
};
