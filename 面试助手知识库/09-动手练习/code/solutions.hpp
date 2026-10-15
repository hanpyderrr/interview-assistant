#pragma once
#include <cstdint>
#include <mutex>
#include <optional>
#include <stdexcept>
#include <vector>
class RingBuffer {
public:
    explicit RingBuffer(std::size_t) {}
    std::size_t write(const std::vector<std::uint8_t>&) {return 0;}
    std::vector<std::uint8_t> read(std::size_t) {return {};}
};
class Parser {
public:
    std::vector<std::vector<std::uint8_t>> feed(const std::vector<std::uint8_t>&) {return {};}
    std::size_t buffered() const {return 0;}
    void reset() {}
};
class BoundedQueue {
public:
    explicit BoundedQueue(std::size_t) {}
    bool push(int) {return false;}
    std::optional<int> pop() {return {};}
    void close() {}
};
