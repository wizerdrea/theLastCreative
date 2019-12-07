/*globals Vue, io */

var app = new Vue({
    el: '#app',
    data: {
        socket: {},
        messages: [],
        text: '',
    },
    created() {
        this.socket = io();
    },
    methods: {
        test() {

                this.socket.emit('chat message', this.text);
                this.messages.push(this.text);
                this.text = '';
        },
        received(msg) {
                this.messages.push(msg);
                console.log(msg);
        },
    },
    mounted() {
        this.socket.on('chat message', this.received);
    },
});