/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements.  See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License.  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

// Fire me up!

module.exports = {
    implements: 'clusters-routes',
    inject: ['require(lodash)', 'require(express)', 'mongo', 'services/space']
};

module.exports.factory = function(_, express, mongo, spaceService) {
    return new Promise((factoryResolve) => {
        const router = new express.Router();

        /**
         * Save cluster.
         */
        router.post('/save', (req, res) => {
            const params = req.body;
            const caches = params.caches;
            const igfss = params.igfss;

            mongo.Cluster.findOne({space: params.space, name: params.name}).exec()
                .then((existingCluster) => {
                    const clusterId = params._id;

                    if (existingCluster && clusterId !== existingCluster._id.toString())
                        throw new Error('Cluster with name: "' + existingCluster.name + '" already exist.');

                    if (clusterId) {
                        return mongo.Cluster.update({_id: clusterId}, params, {upsert: true}).exec()
                            .then(() => mongo.Cache.update({_id: {$in: caches}}, {$addToSet: {clusters: clusterId}}, {multi: true}).exec())
                            .then(() => mongo.Cache.update({_id: {$nin: caches}}, {$pull: {clusters: clusterId}}, {multi: true}).exec())
                            .then(() => mongo.Igfs.update({_id: {$in: igfss}}, {$addToSet: {clusters: clusterId}}, {multi: true}).exec())
                            .then(() => mongo.Igfs.update({_id: {$nin: igfss}}, {$pull: {clusters: clusterId}}, {multi: true}).exec())
                            .then(() => res.send(clusterId));
                    }

                    return (new mongo.Cluster(params)).save()
                        .then((cluster) =>
                            mongo.Cache.update({_id: {$in: caches}}, {$addToSet: {clusters: cluster._id}}, {multi: true}).exec()
                                .then(() => mongo.Cache.update({_id: {$nin: caches}}, {$pull: {clusters: cluster._id}}, {multi: true}).exec())
                                .then(() => mongo.Igfs.update({_id: {$in: igfss}}, {$addToSet: {clusters: cluster._id}}, {multi: true}).exec())
                                .then(() => mongo.Igfs.update({_id: {$nin: igfss}}, {$pull: {clusters: cluster._id}}, {multi: true}).exec())
                                .then(() => res.send(cluster._id))
                        );
                })
                .catch((err) => mongo.handleError(res, err));
        });

        /**
         * Remove cluster by ._id.
         */
        router.post('/remove', (req, res) => {
            const params = req.body;
            const clusterId = params._id;

            mongo.Cache.update({clusters: {$in: [clusterId]}}, {$pull: {clusters: clusterId}}, {multi: true}).exec()
                .then(() => mongo.Igfs.update({clusters: {$in: [clusterId]}}, {$pull: {clusters: clusterId}}, {multi: true}).exec())
                .then(() => mongo.Cluster.remove(params).exec())
                .then(() => res.sendStatus(200))
                .catch((err) => mongo.handleError(res, err));
        });

        /**
         * Remove all clusters.
         */
        router.post('/remove/all', (req, res) => {
            // Get owned space and all accessed space.
            spaceService.spaceIds(req.currentUserId(), req.header('IgniteDemoMode'))
                .then((spaceIds) => mongo.Cache.update({space: {$in: spaceIds}}, {clusters: []}, {multi: true}).exec()
                    .then(() => mongo.Igfs.update({space: {$in: spaceIds}}, {clusters: []}, {multi: true}).exec())
                    .then(() => mongo.Cluster.remove({space: {$in: spaceIds}}).exec())
                )
                .then(() => res.sendStatus(200))
                .catch((err) => mongo.handleError(res, err));
        });

        factoryResolve(router);
    });
};
