const express = require('express');
const router = express.Router();
const {User, Trip, Activity } = require('../models');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const tokenAuth = require('../middleware/tokenAuth');
const cloudinary = require('cloudinary').v2;
const env = require('dotenv')
const Amadeus = require('amadeus');
const { response } = require('express');

//establish cloudinary configuration for use uploading images
cloudinary.config({
    cloud_name: process.env.CLOUD_NAME,
    api_key: process.env.CLOUD_API,
    api_secret: process.env.CLOUD_SECRET,
})

const amadeus = new Amadeus({
    clientId: process.env.AMADEUS_CLIENT_ID,
    clientSecret: process.env.AMADEUS_CLIENT_SECRET,
   // logger: new MyConsole(),
    //logLevel: 'debug',
})

// router.get('/getAma', (req, res) => {
//     return res.json(amadeus);
// })
// router.get(`/getAmadeus`, (req, res) =>{
//     console.log("someone is requesting amadeus");
//     console.log("the request", req.body);
//     amadeus.shopping.activities.get({
//          latitude: req.body.latitude,
//         longitude: req.body.longitude,
//     }).then((response) => {
//          return res.json(response.data);
//      }).catch(err => {
//          return res.status(403).json({message:"error", err});
//      })
//     //return res.json(amadeus);
//     // amadeus.referenceData.locations.pointsOfInterest.get({
//     //     latitude : 41.397158,
//     //     longitude : 2.160873
//     //   }).then((response) => {
//     //       return res.status(200).json(response.data);
//     //   })
//     amadeus.client.get(`"https://test.api.amadeus.com/v1/shopping/activities?longitude=-3.69170868&latitude=40.41436995&radius=1"`
//     ).then((response) => {
//         console.log(response.body);
//         return res.json(response.body);
//     })
// })

// Send the API Keys for use on the front end, tokenAuth??
router.get(`/amadeusId`, tokenAuth, (req, res) => {

    res.json(`${process.env.AMADEUS_CLIENT_ID}`);
})
// Send the API Keys for use on the front end, tokenAuth??
router.get(`/amadeusSe`, tokenAuth, (req, res) => {
    res.json(`${process.env.AMADEUS_CLIENT_SECRET}`)
})


//create a new user account and store the information as a JWT
router.post("/signup", (req, res) => {
    console.log(req.body);
    User.create({
        first_name: req.body.firstName,
        last_name: req.body.lastName,
        location: req.body.location,
        username: req.body.username,
        password: req.body.password,
        email: req.body.email,
        image_path: req.body.image_path
    }).then(newUser => {
        const token = jwt.sign({
            username:newUser.username,
            email:newUser.email,
            id:newUser.id
        },
        process.env.JWT_SECRET,
        {
            expiresIn:"2h"
        })
        res.json({token, user:newUser })
    }).catch(err => {
        console.log(err);
        res.status(500).json({ message: "an error occured", err })
    })
})

//login in to a current user account, verify encrypted password
router.post("/login", (req, res) => {
    User.findOne({
        where: {
            username: req.body.username
        }
    }).then(user => {
        if (!user) {
            console.log('user not found')
            return res.status(403).json({ message: "auth failed" })
        } else if (!bcrypt.compareSync(req.body.password, user.password)) {
            console.log(req.body.password);
            console.log("passwords dont match")
            return res.status(403).json({ message: "auth failed" })
        } else {
            const token = jwt.sign({
                username:user.username,
                email:user.email,
                id:user.id
            },
            process.env.JWT_SECRET,
            {
                expiresIn:"2h"
            })
            res.json({token, user })
        }
    })
    .catch(err => {
        console.log(err);
        res.status(500).json({ message: "an error occured", err })
    })
})
//get current user information based on the supplied JWT
router.get("/profile", tokenAuth, (req, res) => {
    res.json(req.user)
});
//return all the trips associated with the supplied user ID, sort by date
router.get("/dashboard/:id", tokenAuth, (req, res) => {
    User.findOne({
        where: {
            id: req.params.id,
        },
        include: [
           {
            model: Trip,
            as: "creator",
        } 
    ],
    order: [["creator", 'start_date', 'ASC']],
    }).then(userData => {
        return res.json(userData);
    }).catch(err => {
        console.log(err);
        return res.status(403).json({message:"error", err});
    })
    });
//find all friends associated with a given userID
router.get("/friends/:id", tokenAuth,  (req, res) =>{
    User.findOne({
        where: {id : req.params.id},
        include: [
            {
            model: User,
            as: 'friend',
        }]
    }).then(userData => {
        return res.json(userData);
    }).catch(err => {
        console.log(err);
        return res.status(403).json({message:"error", err});
    })
});
//upload a profile picture using cloudinary api and update the image_path in the user model
router.put("/profilepic/:id", tokenAuth,  (req, res) => {
    console.log(req.body);
    cloudinary.uploader.upload(req.body.image, {tags: 'profile_pic'}, function (err, image) {
        console.log("** File Upload");
        if (err) { console.log(err) }
        else {
        console.log(`* ${image.public_id}`);
        console.log(`* ${image.url}`);
        User.findOne({ where: { id: req.params.id } })
        .then(user => {
            if(user) {
                user.update({
                    image_path: image.url
                }).then(updatedUser => {
                    return res.json(updatedUser);
                })
            }
        }).catch(err => {
            console.log(err);
            return res.status(403).json({message:"error", err});
        })
        }
    })
})
//add a new friend by their ID to the supplied user ID
router.post("/friends/:myid/:friendid", tokenAuth,  (req, res) =>{
User.findOne({where: {id: req.params.myid}})
.then(userData => {
    userData.addFriend(req.params.friendid)
    return res.json(userData);
}).catch(err => {
    console.log(err);
    return res.status(403).json({message:"error", err});
})
})
//find user based on their email address
router.get("/getByEmail/:email", tokenAuth, (req,res) => {
    User.findOne({where: {email: req.params.email}})
    .then(user => {
        if(user) {
            return res.json(user);
        } else {
            return res.json({message: "no matching email found"});
        }
    }).catch(err =>{
        console.log(err);
        return res.status(403).json({message:"error", err});
    })
})

//edit a user based on their ID
router.put("/edit/:id", tokenAuth,  (req, res) => {
    console.log('req.body: ', req.body)
    console.log('req.params: ',req.params)
    User.update(req.body, { where: { id: req.params.id } })
    .then(user => {
                return res.json(user);
    }).catch(err => {
        console.log(err);
        return res.status(403).json({message:"error", err});
    })
});

module.exports = router;
