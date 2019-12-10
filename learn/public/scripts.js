/*globals Vue, io */

var app = new Vue({
    el: '#app',
    data: {
        socket: {},
        inGame: false,
        game: {},
        error: false,
        character: {},
        youtTurn: false,
    },
    created() {
        this.socket = io();
    },
    methods: {
        received(msg) {
                console.log(msg);
        },
        newGame() {
            this.socket.emit('newGame');
        },
        gameUpdate(updatedGame) {
            this.game = updatedGame;
            this.inGame = true;
            if (this.socket.id == this.game.player1.playerID)
            {
                this.character = this.game.player1;
            }
            else if (this.socket.id == this.game.player2.playerID)
            {
                this.character = this.game.player2;
            }
            if (this.game.currentPlayer == this.socket.id)
            {
                this.yourTurn = true;
            }
            else {
                this.yourTurn = false;
            }
        },
        quit(){
            this.inGame = false;
            this.game = {};
            this.character = {};
        },
        quitGame() {
            this.socket.emit('quit');
        },
        makeAttack(index) {
            this.socket.emit('attack', index);
        },
    },
    mounted() {
        this.socket.on('chat message', this.received);
        this.socket.on('update game', this.gameUpdate);
        this.socket.on('quit', this.quit);
    },
});