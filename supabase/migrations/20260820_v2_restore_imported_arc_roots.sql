-- Isolated Version Two only.
-- Restores source-documented story_arcs.root_node_id values omitted by the
-- original read-only importer, without inventing graph relationships.
-- Source mapping was read from the retained original under a read-only query
-- and prechecked in V2: 45/45 arcs and 45/45 root nodes exist.
-- Scope review excluded Callais and redistricting-adjacent arcs.

with documented_arc_roots(arc_id, root_node_id) as (
values
  ('04316658-9178-41ef-b2f0-15b8374c6bef'::uuid, '74f30e1f-097e-4d8f-a736-504ebabb2945'::uuid),
  ('0ae6ae29-c10e-477b-b683-b1a2a57beac7'::uuid, 'b426ae6d-0f92-4182-bad3-83a52e1ae226'::uuid),
  ('18316a27-c9a8-4c1a-8ce3-5ebad760c3f5'::uuid, '995e57ee-391c-4e05-a4d6-732aa7122adf'::uuid),
  ('1a218287-a50a-4fb6-8e04-323bf987f58f'::uuid, '89631aab-5747-45dd-a6bf-eecf430e3f52'::uuid),
  ('1af5cb9c-9359-4a04-b39c-93fd47b98b9d'::uuid, 'e77493df-71ac-42ac-adbf-5b04781eb227'::uuid),
  ('287cd846-3e7a-48a1-befd-f672d3efda4e'::uuid, 'ea3141e8-bf12-4c4a-a5e4-d3a7bfe78d5a'::uuid),
  ('2d717e58-036a-4dd2-bc58-3b51c7f4229f'::uuid, '1d596a86-dc03-408b-a469-745dca3dc849'::uuid),
  ('317eb508-4960-4f19-ae81-3d58224e8365'::uuid, '32dc34d4-dc7f-43c8-812f-1699e50130fa'::uuid),
  ('47bef144-da13-4a16-b75e-ca2e3e8760fc'::uuid, 'ae18db9e-57f9-4c79-ad14-3beb38b750e1'::uuid),
  ('47f0d51f-1905-4386-ad6d-7e823ddeb86d'::uuid, 'aa66f5ce-6b1b-48e2-9042-033b7297bb68'::uuid),
  ('4a75ed2b-1214-439f-b409-3acc3f62a9a9'::uuid, 'd5e0a674-75cd-4ef6-a032-aae81200398c'::uuid),
  ('4bb3e24c-c8d0-406c-9ce6-8369a9601a2a'::uuid, '9cc197b2-e8ef-4ac8-9ead-d52ff1e81255'::uuid),
  ('4c19e126-9b59-4227-879b-d1fa0f1cb24c'::uuid, '76d210a9-6dba-4827-8a43-a0a5bfeae7b8'::uuid),
  ('52079271-beaa-4e71-95fd-6ca442631b5e'::uuid, 'bb701453-5cc1-4f8f-b4fa-2c7325b02666'::uuid),
  ('57848af8-2167-4f40-8d1a-49c8e70f9bd5'::uuid, 'db19f0d2-a96f-45ac-8eaf-d64a9ddb8b61'::uuid),
  ('5be035f4-4583-469a-b4ce-86981077891a'::uuid, '811a7aaf-8468-4d2c-846a-b5c21d359874'::uuid),
  ('5ef8880b-60ee-48a3-86d5-01f4fd5f6ee6'::uuid, '0ed8e7b5-5212-4d7c-a860-b81f61de6c79'::uuid),
  ('61487bb0-8a4d-484e-b373-41601c95c6a4'::uuid, '3674dedb-984c-4adb-9ebc-b140e9acf9ad'::uuid),
  ('641df17b-8624-4aad-bc5b-27ed5f7df44a'::uuid, '996e9831-7ee9-4cc6-987b-72036811166e'::uuid),
  ('6dff7915-a6c5-4565-b74f-6f4d7bc5b973'::uuid, 'aa0bce55-83d8-4fbd-85df-f55156f60b8b'::uuid),
  ('77e39861-bbaf-4f74-8d10-9047ae82d768'::uuid, 'f0c57658-0e4c-4fed-9a81-a421a25a0ec8'::uuid),
  ('82e790d5-dafb-47f8-afd5-3819c2691ab1'::uuid, '569c252b-5b70-4764-b028-fe79199badd9'::uuid),
  ('8c673c64-0315-4817-9bc9-699582d0f4d7'::uuid, '13787d14-90b7-4461-9b2d-72cea6e1f656'::uuid),
  ('8da43fd7-e8ca-4760-b728-e3ffe7145243'::uuid, '071f8a22-f039-404a-b018-3cc91b484b44'::uuid),
  ('9022b582-d564-4e97-89c1-387871f24b45'::uuid, '0206a142-cca1-4503-8d1e-0efe2ac7521d'::uuid),
  ('91343f3e-4e69-476c-970f-026a81ea950e'::uuid, '7b49493f-6dd8-49b2-be3a-0a62ee2bc894'::uuid),
  ('926ee875-2572-4d6e-9d6f-627cbc049e97'::uuid, '89d5d4b8-fa3d-4cb1-b654-5106050eddb1'::uuid),
  ('a17e11f6-4038-45bf-94ce-b324fc456836'::uuid, '90b6bc0b-09db-48cd-b233-97c0da5ee630'::uuid),
  ('a99f51b5-d2fb-4513-8ed8-9c50956f90b7'::uuid, '8fe168d6-3b64-4cc6-94ac-8f4ee86b9142'::uuid),
  ('ab781e56-3dc7-41f6-8ccb-294fb5ae5749'::uuid, 'd4871a73-20e5-47f4-bcd5-0b06d60e68cf'::uuid),
  ('ad72c247-1f62-4ad0-b34a-7201d461a318'::uuid, '45348a8d-c826-4ad7-bb04-3660294c2768'::uuid),
  ('b21f3d36-1ac7-4f73-9b0d-ae065fdc54cc'::uuid, 'c3549e2a-8d10-4578-88f0-c561cb501f2a'::uuid),
  ('b4404f7f-ce42-495d-bdaf-31dc272d859a'::uuid, 'a2bafde5-280a-423e-b1f9-334d318dae17'::uuid),
  ('b492cb87-23ff-4e7c-81d1-59ed978b3fea'::uuid, '9a62241a-90dc-4ab6-b944-001c7464fa23'::uuid),
  ('bd9ba1a2-60c8-4415-b128-0fce2bf35583'::uuid, '6aa6cb25-292d-454c-a907-cde083a99fef'::uuid),
  ('cf129697-2044-4f83-8ed2-08fad5307e0c'::uuid, '7a71f8b9-adb2-4fe5-a00e-40e6d3035c48'::uuid),
  ('d115cc6b-51ff-4646-91ac-cab18e6df38e'::uuid, '5e0819ee-b297-4092-bea7-0dd50d833132'::uuid),
  ('d5b57e45-eb09-46e9-9650-543af8106270'::uuid, '35a75f5e-b405-4b3d-9bda-0334f8d56146'::uuid),
  ('d9e8c3db-210f-4a8b-8f3b-02e64c232f9a'::uuid, 'f2afd41f-49b8-4e48-8653-f4aee3c97337'::uuid),
  ('dc440c4f-1736-44f7-8e2a-4c75718e9641'::uuid, '6ec66b5e-2377-412d-81fb-11b7fe5c41fe'::uuid),
  ('e20cf64b-54ef-4aea-913b-0be9749a724c'::uuid, 'fd03f415-336a-4f68-b2b4-845dc0170e52'::uuid),
  ('f2a9d3c3-b18b-454d-8896-7adf8b390bee'::uuid, '1c731ae4-c082-4fe8-9a88-0ae0765c64cc'::uuid),
  ('f411d7b7-50c7-437c-8dda-dfcbe82a49f0'::uuid, '163fd4bc-af01-46c3-8f53-fc071050a7b7'::uuid),
  ('f6bacee4-8f08-46be-bfb1-5b0e22cfa6f1'::uuid, 'e8cc30f8-a081-45ae-b43d-94ee7310d9b4'::uuid),
  ('ff5c7d85-f552-433d-b6d4-381baae50065'::uuid, '90903674-f83f-4fa1-886c-6dcd54d6bec4'::uuid)
), eligible as (
  select mapping.arc_id, mapping.root_node_id
  from documented_arc_roots mapping
  join public.story_arcs arc on arc.id = mapping.arc_id
  join public.nodes root_node on root_node.id = mapping.root_node_id
  where arc.root_node_id is null
)
update public.story_arcs arc
set root_node_id = eligible.root_node_id
from eligible
where arc.id = eligible.arc_id;
