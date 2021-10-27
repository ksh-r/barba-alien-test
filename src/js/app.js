import '../scss/main.scss';

import barba from '@barba/core';

import Index from './pages/index';
import Index2 from './pages/index2';

barba.init( {
    views: [Index, Index2],
    transitions: [
        {
            name: 'going to index',
            to: {
                namespace: ['index']
            },
            once(data) {
                console.log('index once transition')
            },
            enter(data) {
                console.log('index enter transition')
            },
            leave(data) {
                console.log('any page leaving for index')
            }
        },
        {
            name: 'going to index2',
            to: {
                namespace: ['index2']
            },
            once(data) {
                console.log('index2 once transition')
            },
            enter(data) {
                console.log('index2 enter transition')
            },
            leave(data) {
                console.log('any page leaving for index2')
            }
        }
    ]
} );