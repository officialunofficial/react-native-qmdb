#pragma once

#include <NitroModules/HybridObject.hpp>
#include <string>
#include <optional>
#include <vector>
#include <future>

// Rust FFI — C-compatible functions from qmdb_mobile
extern "C" {
  const char *qmdb_version(void);
  void qmdb_free_string(char *ptr);
  const char *qmdb_open(const char *config_json);
  const char *qmdb_close(const char *path);
  const char *qmdb_destroy(const char *path);
  const char *qmdb_info(const char *path);
  const char *qmdb_get(const char *path, const char *key);
  const char *qmdb_update(const char *path, const char *key, const char *value);
  const char *qmdb_delete(const char *path, const char *key);
  const char *qmdb_batch_update(const char *path, const char *entries_json);
  const char *qmdb_into_mutable(const char *path);
  const char *qmdb_commit(const char *path);
  const char *qmdb_merkleize(const char *path);
  const char *qmdb_prove(const char *path, const char *key);
  const char *qmdb_range_proof(const char *path, uint64_t start, uint64_t end);
  const char *qmdb_verify(const char *proof_json, const char *root);
  const char *qmdb_operations_since(const char *path, uint64_t since, uint64_t limit);
  const char *qmdb_apply_operations(const char *path, const char *ops_json);
}

namespace margelo::nitro::qmdb {

using namespace facebook;

/**
 * C++ HybridObject for QMDB — calls Rust extern "C" FFI functions directly.
 *
 * This is the bridge between Nitro's JSI bindings and the Rust library.
 * No JSON serialization at the JS boundary — Nitro handles type marshalling.
 * JSON is only used at the C++ <-> Rust FFI boundary.
 */
class HybridQMDB : public HybridObject {
public:
  HybridQMDB() : HybridObject(TAG) {}

  // Read the result from a Rust FFI call, free the C string.
  static std::string readRust(const char *ptr) {
    if (!ptr) return "{}";
    std::string result(ptr);
    qmdb_free_string(const_cast<char *>(ptr));
    return result;
  }

  // --- Properties ---

  std::string getVersion() {
    return readRust(qmdb_version());
  }

  // --- Lifecycle ---

  std::string open(const std::string &configJson) {
    return readRust(qmdb_open(configJson.c_str()));
  }

  std::string close(const std::string &path) {
    return readRust(qmdb_close(path.c_str()));
  }

  std::string destroy(const std::string &path) {
    return readRust(qmdb_destroy(path.c_str()));
  }

  std::string info(const std::string &path) {
    return readRust(qmdb_info(path.c_str()));
  }

  // --- KV Operations ---

  // Sync — runs on JS thread for fast reads
  std::string get(const std::string &path, const std::string &key) {
    return readRust(qmdb_get(path.c_str(), key.c_str()));
  }

  std::string update(const std::string &path, const std::string &key, const std::string &value) {
    return readRust(qmdb_update(path.c_str(), key.c_str(), value.c_str()));
  }

  std::string remove(const std::string &path, const std::string &key) {
    return readRust(qmdb_delete(path.c_str(), key.c_str()));
  }

  std::string batchUpdate(const std::string &path, const std::string &entriesJson) {
    return readRust(qmdb_batch_update(path.c_str(), entriesJson.c_str()));
  }

  // --- State Machine ---

  std::string intoMutable(const std::string &path) {
    return readRust(qmdb_into_mutable(path.c_str()));
  }

  std::string commit(const std::string &path) {
    return readRust(qmdb_commit(path.c_str()));
  }

  std::string merkleize(const std::string &path) {
    return readRust(qmdb_merkleize(path.c_str()));
  }

  // --- Proofs ---

  std::string prove(const std::string &path, const std::string &key) {
    return readRust(qmdb_prove(path.c_str(), key.c_str()));
  }

  std::string rangeProof(const std::string &path, uint64_t start, uint64_t end) {
    return readRust(qmdb_range_proof(path.c_str(), start, end));
  }

  std::string verify(const std::string &proofJson, const std::string &root) {
    return readRust(qmdb_verify(proofJson.c_str(), root.c_str()));
  }

  // --- Sync ---

  std::string operationsSince(const std::string &path, uint64_t since, uint64_t limit) {
    return readRust(qmdb_operations_since(path.c_str(), since, limit));
  }

  std::string applyOperations(const std::string &path, const std::string &opsJson) {
    return readRust(qmdb_apply_operations(path.c_str(), opsJson.c_str()));
  }

  // --- Memory ---

  size_t getExternalMemorySize() override {
    return 0; // TODO: query Rust for actual memory usage
  }

protected:
  void loadHybridMethods() override {
    HybridObject::loadHybridMethods();
    registerHybrids(this, [](Prototype &proto) {
      // Properties
      proto.registerHybridGetter("version", &HybridQMDB::getVersion);

      // Lifecycle
      proto.registerHybridMethod("open", &HybridQMDB::open);
      proto.registerHybridMethod("close", &HybridQMDB::close);
      proto.registerHybridMethod("destroy", &HybridQMDB::destroy);
      proto.registerHybridMethod("info", &HybridQMDB::info);

      // KV
      proto.registerHybridMethod("get", &HybridQMDB::get);
      proto.registerHybridMethod("update", &HybridQMDB::update);
      proto.registerHybridMethod("remove", &HybridQMDB::remove);
      proto.registerHybridMethod("batchUpdate", &HybridQMDB::batchUpdate);

      // State machine
      proto.registerHybridMethod("intoMutable", &HybridQMDB::intoMutable);
      proto.registerHybridMethod("commit", &HybridQMDB::commit);
      proto.registerHybridMethod("merkleize", &HybridQMDB::merkleize);

      // Proofs
      proto.registerHybridMethod("prove", &HybridQMDB::prove);
      proto.registerHybridMethod("rangeProof", &HybridQMDB::rangeProof);
      proto.registerHybridMethod("verify", &HybridQMDB::verify);

      // Sync
      proto.registerHybridMethod("operationsSince", &HybridQMDB::operationsSince);
      proto.registerHybridMethod("applyOperations", &HybridQMDB::applyOperations);
    });
  }

private:
  static constexpr auto TAG = "QMDB";
};

} // namespace margelo::nitro::qmdb
